// Imperative core of the demo: owns the project, the active variant and the
// measurements. The React shell renders its state and calls into it; the
// Playwright runs drive the same object through window.__spike.
import { generateProject, type Project } from '../../shared/fixture'
import { measureLayout, type Controller, type Layout } from './common'
import { SingleEditor } from './single'
import { Windowed } from './windowed'
import {
  BrowserTimings,
  LatencyMeter,
  PassiveScrollWatch,
  afterNextPaint,
  domCounts,
  heapMB,
  runProgrammaticScroll,
  summarize,
  type ScrollResult,
  type Summary,
} from './metrics'

export type Variant = 1 | 2 | 3

export interface LoadResult {
  variant: Variant
  generateMs: number
  buildMs: number
  cursorMs: number
  totalMs: number
  /** performance.now() when the frame with the editable cursor was produced; time since navigation start. */
  sinceNavigationMs: number
  editable: boolean
  restored: boolean
  scene: number
  offset: number
}

export interface Saved {
  variant: Variant
  loaded: boolean
  scene: number
  offset: number
}

const STORAGE_KEY = 'spike-a-position'

export function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

export class Core {
  project: Project | null = null
  controller: Controller | null = null
  variant: Variant = 3
  layout: Layout | null = null
  generateMs = 0
  lastLoad: LoadResult | null = null
  lastJumpMs: number | null = null
  lastFind: { query: string; count: number; ms: number; paintedMs: number } | null = null
  lastScroll: ScrollResult | null = null
  lastCopy: { chars: number; ms: number } | null = null
  readonly latency = new LatencyMeter(window)
  readonly timings = new BrowserTimings()
  private passive: PassiveScrollWatch | null = null
  private listeners = new Set<() => void>()
  manualAnchor = true
  overscan = 2
  dom: { elements: number; textNodes: number } | null = null

  constructor(
    private host: HTMLElement,
    readonly scroller: HTMLElement,
  ) {
    const params = new URLSearchParams(location.search)
    // anchor=native: leave corrections to the browser. anchor=off: no corrections
    // at all (to show what the scroll test reports when nothing holds the position).
    if (params.get('anchor') === 'native' || params.get('anchor') === 'off') this.manualAnchor = false
    if (params.get('anchor') === 'off') scroller.style.setProperty('overflow-anchor', 'none')
    if (params.get('overscan')) this.overscan = Number(params.get('overscan'))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save()
    })
    window.addEventListener('pagehide', () => this.save())
    setInterval(() => this.save(), 3000)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  save(): void {
    if (!this.controller) return
    try {
      const position = this.controller.position()
      const saved: Saved = { variant: this.variant, loaded: true, ...position }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      /* storage unavailable (private mode): nothing to do in a spike */
    }
  }

  forget(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  unload(): void {
    this.controller?.destroy()
    this.controller = null
    this.host.textContent = ''
    this.emit()
  }

  /** Builds the chosen variant over the fixture and puts an editable cursor at
   *  the given position (default: the middle of the project). */
  async load(variant: Variant, at?: { scene: number; offset: number }, restored = false): Promise<LoadResult> {
    const start = performance.now()
    this.controller?.destroy()
    this.controller = null
    this.host.textContent = ''
    this.variant = variant

    let generateMs = 0
    if (!this.project) {
      const t = performance.now()
      this.project = generateProject()
      generateMs = performance.now() - t
      this.generateMs = generateMs
    }
    const project = this.project
    const sample = project.scenes[0].blocks.map((block) => block.runs.map((run) => run.text).join('')).join(' ')
    this.layout = measureLayout(this.scroller, sample)

    const buildStart = performance.now()
    this.controller =
      variant === 3
        ? new Windowed(this.host, this.scroller, project, this.layout, { manualAnchor: this.manualAnchor, overscan: this.overscan })
        : new SingleEditor(variant, this.host, this.scroller, project, this.layout)
    const buildMs = performance.now() - buildStart

    const scene = Math.min(at?.scene ?? project.midScene, project.scenes.length - 1)
    const offset = at?.offset ?? Math.floor(project.scenes[scene].chars / 2)
    const cursorStart = performance.now()
    this.controller.jumpToScene(scene, offset)
    const cursorMs = performance.now() - cursorStart
    const painted = await afterNextPaint()

    const active = document.activeElement as HTMLElement | null
    const selection = document.getSelection()
    const editable = !!active && active.isContentEditable && !!selection && selection.rangeCount > 0 && active.contains(selection.anchorNode)
    this.lastLoad = {
      variant,
      generateMs,
      buildMs,
      cursorMs,
      totalMs: painted - start,
      sinceNavigationMs: painted,
      editable,
      restored,
      scene,
      offset,
    }
    this.latency.reset()
    this.refreshDom()
    this.emit()
    return this.lastLoad
  }

  async jump(scene: number, offset = 0, startStamp?: number): Promise<number> {
    if (!this.controller) return NaN
    const start = startStamp ?? performance.now()
    this.controller.jumpToScene(scene, offset)
    const painted = await afterNextPaint()
    this.lastJumpMs = painted - start
    this.emit()
    return this.lastJumpMs
  }

  async find(query: string): Promise<{ count: number; ms: number; paintedMs: number }> {
    if (!this.controller) return { count: 0, ms: 0, paintedMs: 0 }
    const start = performance.now()
    const result = this.controller.find(query)
    this.lastFind = { query, count: result.count, ms: result.ms, paintedMs: 0 }
    this.emit() // the count is rendered in this frame
    const painted = await afterNextPaint()
    this.lastFind = { query, count: result.count, ms: result.ms, paintedMs: painted - start }
    this.emit()
    return this.lastFind
  }

  gotoMatch(n: number): void {
    this.controller?.gotoMatch(n)
  }

  copySelection(): string {
    if (!this.controller) return ''
    const start = performance.now()
    const text = this.controller.selectionText()
    this.lastCopy = { chars: text.length, ms: performance.now() - start }
    this.emit()
    return text
  }

  /** Types through the browser's editing pipeline without a keyboard
   *  (execCommand insertText). Useful on a phone, where a script cannot press
   *  keys; it does not exercise the on-screen keyboard or autocorrect. */
  async typeSynthetic(count = 200, gapMs = 30): Promise<Summary> {
    const view = this.controller?.activeView()
    if (!view) return summarize([])
    view.focus()
    this.latency.reset()
    const text = 'the quick brown fox jumps over the lazy dog and keeps on running '
    for (let i = 0; i < count; i++) {
      await this.latency.timeSynthetic(() => document.execCommand('insertText', false, text[i % text.length]))
      await new Promise((resolve) => setTimeout(resolve, gapMs))
    }
    this.emit()
    return this.latency.summary()
  }

  private scrollHost() {
    const controller = this.controller!
    return { scroller: this.scroller, blankPx: () => controller.blankPx(), compensation: () => controller.compensation() }
  }

  private windowStats(): { mounts: number; unmounts: number; compensations: number } | null {
    const debug = this.controller?.debug() as { mounts?: number; unmounts?: number; compensations?: number } | undefined
    if (!debug || typeof debug.mounts !== 'number') return null
    return { mounts: debug.mounts, unmounts: debug.unmounts ?? 0, compensations: debug.compensations ?? 0 }
  }

  private withWindowStats(result: ScrollResult, before: ReturnType<Core['windowStats']>): ScrollResult & { mounts?: number; unmounts?: number; corrections?: number } {
    const after = this.windowStats()
    if (!before || !after) return result
    return {
      ...result,
      mounts: after.mounts - before.mounts,
      unmounts: after.unmounts - before.unmounts,
      corrections: after.compensations - before.compensations,
    }
  }

  /** Scroll driven from script, one step per frame.
   *  slow: 600 px/s up for 12 s, then down for 12 s.
   *  fling: starts at 12,000 px/s and decays (time constant 1.2 s), up, then down. */
  async scrollTest(kind: 'slow' | 'fling' | 'up', scale = 1): Promise<ScrollResult> {
    if (!this.controller) throw new Error('nothing loaded')
    const host = this.scrollHost()
    let velocity: (t: number) => number
    if (kind === 'up') {
      // 1,500 px/s upwards for 5 s: used to scroll into one particular scene.
      velocity = (t) => (t < 5000 * scale ? -1500 : 0)
    } else if (kind === 'slow') {
      const half = 12000 * scale
      velocity = (t) => (t < half ? -600 : t < 2 * half ? 600 : 0)
    } else {
      const v0 = 12000
      const tau = 1200
      const span = tau * Math.log(v0 / 60)
      velocity = (t) => {
        if (t < span) return -v0 * Math.exp(-t / tau)
        if (t < 2 * span) return v0 * Math.exp(-(t - span) / tau)
        return 0
      }
    }
    const before = this.windowStats()
    const result = this.withWindowStats(await runProgrammaticScroll(host, kind, velocity), before)
    this.lastScroll = result
    this.emit()
    return result
  }

  private passiveBefore: ReturnType<Core['windowStats']> = null

  passiveStart(kind: string): void {
    if (!this.controller) return
    this.passiveBefore = this.windowStats()
    this.passive = new PassiveScrollWatch(this.scrollHost(), kind)
  }

  passiveStop(): ScrollResult | null {
    const raw = this.passive?.stop() ?? null
    this.passive = null
    const result = raw ? this.withWindowStats(raw, this.passiveBefore) : null
    if (result) this.lastScroll = result
    this.emit()
    return result
  }

  refreshDom(): void {
    this.dom = domCounts(document)
  }

  snapshot() {
    return {
      variant: this.variant,
      loaded: !!this.controller,
      load: this.lastLoad,
      typing: this.latency.summary(),
      jumpMs: this.lastJumpMs,
      find: this.lastFind,
      scroll: this.lastScroll,
      copy: this.lastCopy,
      mounted: this.controller?.mountedCount() ?? 0,
      dom: this.dom,
      heapMB: heapMB(),
      hasEventTiming: this.timings.hasEventTiming,
      hasLayoutShift: this.timings.hasLayoutShift,
      overflowAnchor: typeof CSS !== 'undefined' && CSS.supports('overflow-anchor', 'auto'),
      contentVisibility: typeof CSS !== 'undefined' && CSS.supports('content-visibility', 'auto'),
      manualAnchor: this.manualAnchor,
      debug: this.controller?.debug() ?? null,
    }
  }
}
