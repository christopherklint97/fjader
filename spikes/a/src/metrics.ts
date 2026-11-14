// Measurement helpers shared by the on-screen readout and the Playwright runs.

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

export interface Summary {
  n: number
  p50: number
  p95: number
  p99: number
  max: number
}

export function summarize(samples: number[]): Summary {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length ? sorted[sorted.length - 1] : NaN,
  }
}

/** Resolves after the next frame has been produced on the main thread
 *  (requestAnimationFrame, then a task, which runs after style, layout and paint). */
export function afterNextPaint(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => resolve(performance.now())
      channel.port2.postMessage(0)
    })
  })
}

// ---- keystroke latency: input event to next frame --------------------------

interface PendingKey {
  start: number
  /** A character key: the text arrives in a later `input` event. */
  expectsInput: boolean
  sawInput: boolean
  recorded: boolean
}

/** Measures from the time the browser received a key (or, without a key event,
 *  the beforeinput event) to the first frame produced after the editor has
 *  applied it. One sample per keystroke. */
export class LatencyMeter {
  samples: number[] = []
  /** Start time of each measured keystroke, for matching Event Timing entries. */
  starts: number[] = []
  private pending: PendingKey | null = null
  private blocked = false

  constructor(private target: EventTarget) {
    target.addEventListener('keydown', this.onKeydown, true)
    target.addEventListener('beforeinput', this.onBeforeInput, true)
    target.addEventListener('input', this.onInput, true)
  }

  private stamp(event: Event): number {
    // event.timeStamp is when the browser received the input, on the same clock
    // as performance.now(). Fall back to now() if it looks wrong.
    const now = performance.now()
    return event.timeStamp > 0 && event.timeStamp <= now && now - event.timeStamp < 5000 ? event.timeStamp : now
  }

  private record(key: PendingKey, end: number): void {
    if (key.recorded) return
    key.recorded = true
    this.samples.push(end - key.start)
    this.starts.push(key.start)
    if (this.pending === key) this.pending = null
  }

  private begin(event: Event, expectsInput: boolean): void {
    if (this.blocked || this.pending) return
    const key: PendingKey = { start: this.stamp(event), expectsInput, sawInput: false, recorded: false }
    this.pending = key
    void afterNextPaint().then((end) => {
      if (key.recorded || key.sawInput) return
      if (!key.expectsInput) this.record(key, end)
      // A character key whose text has not arrived yet: wait for the input
      // event; give up after 300 ms (the key did not produce text).
      else setTimeout(() => this.record(key, end), 300)
    })
  }

  private onKeydown = (event: Event) => {
    const e = event as KeyboardEvent
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const key = e.key
    // Virtual keyboards report "Unidentified" or "Process"; the text follows in input events.
    if (key.length === 1 || key === 'Unidentified' || key === 'Process') this.begin(event, true)
    // ProseMirror handles these itself in keydown; there is no input event.
    else if (key === 'Enter' || key === 'Backspace' || key === 'Delete') this.begin(event, false)
  }

  private onBeforeInput = (event: Event) => {
    // Autocorrect, dictation, swipe typing: no usable keydown.
    this.begin(event, true)
  }

  private onInput = () => {
    const key = this.pending
    if (!key || key.recorded) return
    key.sawInput = true
    void afterNextPaint().then((end) => this.record(key, end))
  }

  /** Synthetic typing (execCommand) has no key event; time it explicitly. */
  async timeSynthetic(action: () => void): Promise<void> {
    const start = performance.now()
    this.blocked = true
    action()
    const end = await afterNextPaint()
    this.samples.push(end - start)
    this.starts.push(start)
    this.blocked = false
  }

  reset(): void {
    this.samples = []
    this.starts = []
  }

  summary(): Summary {
    return summarize(this.samples)
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.onKeydown, true)
    this.target.removeEventListener('beforeinput', this.onBeforeInput, true)
    this.target.removeEventListener('input', this.onInput, true)
  }
}

// ---- Event Timing and Layout Instability (where the browser has them) ------

export interface EventTimingEntry {
  name: string
  start: number
  duration: number
  interactionId: number
}

export class BrowserTimings {
  events: EventTimingEntry[] = []
  layoutShifts: { time: number; value: number; hadRecentInput: boolean; maxDy: number }[] = []
  readonly hasEventTiming: boolean
  readonly hasLayoutShift: boolean

  constructor() {
    const supported = typeof PerformanceObserver !== 'undefined' ? PerformanceObserver.supportedEntryTypes ?? [] : []
    this.hasEventTiming = supported.includes('event')
    this.hasLayoutShift = supported.includes('layout-shift')
    if (this.hasEventTiming) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { interactionId?: number })[]) {
          this.events.push({
            name: entry.name,
            start: entry.startTime,
            duration: entry.duration,
            interactionId: entry.interactionId ?? 0,
          })
        }
      })
      // 16 ms is the lowest threshold the API allows; durations are rounded to 8 ms.
      observer.observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit)
    }
    if (this.hasLayoutShift) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          let maxDy = 0
          for (const source of entry.sources ?? []) {
            maxDy = Math.max(maxDy, Math.abs(source.currentRect.y - source.previousRect.y))
          }
          this.layoutShifts.push({ time: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput, maxDy })
        }
      })
      observer.observe({ type: 'layout-shift', buffered: true } as PerformanceObserverInit)
    }
  }

  reset(): void {
    this.events = []
    this.layoutShifts = []
  }
}

// ---- DOM size and heap ------------------------------------------------------

export function domCounts(root: ParentNode = document): { elements: number; textNodes: number } {
  const elements = root.querySelectorAll('*').length
  let textNodes = 0
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) textNodes++
  return { elements, textNodes }
}

export function heapMB(): number | null {
  const memory = (performance as any).memory
  if (!memory || typeof memory.usedJSHeapSize !== 'number') return null
  return memory.usedJSHeapSize / (1024 * 1024)
}

// ---- scroll stability -------------------------------------------------------

export interface ScrollHost {
  scroller: HTMLElement
  /** Pixels of the viewport currently covered by unmounted placeholders. */
  blankPx(): number
  /** Running total of manual scrollTop corrections applied by the windowing code. */
  compensation(): number
}

export interface ScrollResult {
  kind: string
  frames: number
  samples: number
  distancePx: number
  maxShiftPx: number
  shiftsOver1px: number
  maxBlankMs: number
  blankFrames: number
  maxBlankPx: number
  frameP95: number
  frameMax: number
  durationMs: number
}

/** Picks a block near the middle of the viewport to watch for unexpected movement. */
function pickReference(scroller: HTMLElement): HTMLElement | null {
  const rect = scroller.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  for (const fraction of [0.45, 0.3, 0.6, 0.2, 0.75]) {
    const hit = document.elementFromPoint(x, rect.top + rect.height * fraction)
    const block = hit && (hit.closest('p, h2, h3, hr, blockquote') as HTMLElement | null)
    if (block && scroller.contains(block)) return block
  }
  return null
}

class ShiftTracker {
  private ref: HTMLElement | null = null
  private expectedTop = 0
  private lastScrollTop = 0
  private lastComp = 0
  private blankSince: number | null = null
  private frameTimes: number[] = []
  private lastFrame = 0
  result: ScrollResult

  constructor(private host: ScrollHost, kind: string) {
    this.result = {
      kind,
      frames: 0,
      samples: 0,
      distancePx: 0,
      maxShiftPx: 0,
      shiftsOver1px: 0,
      maxBlankMs: 0,
      blankFrames: 0,
      maxBlankPx: 0,
      frameP95: 0,
      frameMax: 0,
      durationMs: 0,
    }
    this.lastScrollTop = host.scroller.scrollTop
    this.lastComp = host.compensation()
  }

  /** Called once per frame. `commanded` is the scroll delta the driver applied
   *  since the previous call, or null when the browser is scrolling by itself
   *  (then the delta is read from scrollTop minus the windowing corrections). */
  frame(now: number, commanded: number | null): void {
    const { scroller } = this.host
    const result = this.result
    result.frames++
    if (this.lastFrame) this.frameTimes.push(now - this.lastFrame)
    this.lastFrame = now

    const scrollTop = scroller.scrollTop
    const comp = this.host.compensation()
    const moved = commanded ?? scrollTop - this.lastScrollTop - (comp - this.lastComp)
    result.distancePx += Math.abs(moved)
    this.lastScrollTop = scrollTop
    this.lastComp = comp

    const scrollerRect = scroller.getBoundingClientRect()
    if (this.ref && this.ref.isConnected) {
      const top = this.ref.getBoundingClientRect().top
      const shift = Math.abs(top - (this.expectedTop - moved))
      result.samples++
      if (shift > result.maxShiftPx) result.maxShiftPx = shift
      if (shift > 1) result.shiftsOver1px++
      this.expectedTop = top
      // Re-pick when the reference leaves the middle band of the viewport.
      if (top < scrollerRect.top + scrollerRect.height * 0.1 || top > scrollerRect.top + scrollerRect.height * 0.8) this.ref = null
    } else {
      this.ref = null
    }
    if (!this.ref) {
      this.ref = pickReference(scroller)
      if (this.ref) this.expectedTop = this.ref.getBoundingClientRect().top
    }

    const blank = this.host.blankPx()
    if (blank > 0) {
      result.blankFrames++
      if (blank > result.maxBlankPx) result.maxBlankPx = blank
      if (this.blankSince === null) this.blankSince = now
      result.maxBlankMs = Math.max(result.maxBlankMs, now - this.blankSince)
    } else if (this.blankSince !== null) {
      result.maxBlankMs = Math.max(result.maxBlankMs, now - this.blankSince)
      this.blankSince = null
    }
  }

  /** The driver tells the tracker where the reference is expected after its step. */
  finish(start: number, end: number): ScrollResult {
    const summary = summarize(this.frameTimes)
    this.result.frameP95 = summary.p95
    this.result.frameMax = summary.max
    this.result.durationMs = end - start
    return this.result
  }
}

/** Programmatic scroll, one step per frame. `velocity(t)` returns px/s at time t (ms);
 *  the step is velocity times the real frame time, so slow frames take bigger steps,
 *  as a finger or a fling would. Ends when velocity returns 0. */
export function runProgrammaticScroll(
  host: ScrollHost,
  kind: string,
  velocity: (elapsedMs: number) => number,
): Promise<ScrollResult> {
  return new Promise((resolve) => {
    const tracker = new ShiftTracker(host, kind)
    const { scroller } = host
    const start = performance.now()
    let last = start
    let commanded: number | null = 0
    const step = (now: number) => {
      tracker.frame(now, commanded)
      const v = velocity(now - start)
      if (v === 0) {
        resolve(tracker.finish(start, now))
        return
      }
      const dt = Math.min(100, now - last)
      last = now
      const before = scroller.scrollTop
      scroller.scrollTop = before + (v * dt) / 1000
      commanded = scroller.scrollTop - before // what the browser accepted (clamped at the ends)
      requestAnimationFrame(step)
    }
    requestAnimationFrame((now) => {
      last = now
      step(now)
    })
  })
}

/** Watches a scroll the browser performs itself (real touch fling). */
export class PassiveScrollWatch {
  private tracker: ShiftTracker
  private running = true
  private start = performance.now()
  constructor(host: ScrollHost, kind: string) {
    this.tracker = new ShiftTracker(host, kind)
    const loop = (now: number) => {
      if (!this.running) return
      this.tracker.frame(now, null)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }
  stop(): ScrollResult {
    this.running = false
    return this.tracker.finish(this.start, performance.now())
  }
}
