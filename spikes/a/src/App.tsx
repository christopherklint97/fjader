import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Core, readSaved, type Variant } from './core'

declare global {
  interface Window {
    __spike?: Core
  }
}

const VARIANTS: { id: Variant; label: string }[] = [
  { id: 1, label: '1 Single' },
  { id: 2, label: '2 Skip-render' },
  { id: 3, label: '3 Windowed' },
]

const fmt = (n: number | null | undefined, digits = 0): string => (n === null || n === undefined || Number.isNaN(n) ? '-' : n.toFixed(digits))

// Buttons must not take the focus (and the keyboard) away from the editor.
const keepFocus = (event: ReactPointerEvent) => event.preventDefault()

export function App() {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<HTMLDivElement>(null)
  const coreRef = useRef<Core | null>(null)
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const [variant, setVariant] = useState<Variant>(() => {
    const fromUrl = Number(params.get('v'))
    if (fromUrl === 1 || fromUrl === 2 || fromUrl === 3) return fromUrl
    return readSaved()?.variant ?? 3
  })
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)
  const [quick, setQuick] = useState('')
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [showReadout, setShowReadout] = useState(true)
  const [status, setStatus] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  const core = coreRef.current
  const snap = core?.snapshot()
  const loaded = !!snap?.loaded

  useEffect(() => {
    const instance = new Core(docRef.current!, scrollerRef.current!)
    coreRef.current = instance
    window.__spike = instance
    const refresh = () => setTick((n) => n + 1)
    const unsubscribe = instance.subscribe(refresh)
    const timer = setInterval(refresh, 1000)

    // The shell tracks the visual viewport so the toolbar stays above the keyboard.
    const viewport = window.visualViewport
    const onViewport = () => {
      if (!viewport) return
      document.documentElement.style.setProperty('--vvh', viewport.height + 'px')
      document.documentElement.style.setProperty('--vvtop', viewport.offsetTop + 'px')
      const view = instance.controller?.activeView()
      if (view && view.hasFocus()) view.dispatch(view.state.tr.scrollIntoView())
    }
    viewport?.addEventListener('resize', onViewport)
    viewport?.addEventListener('scroll', onViewport)
    onViewport()

    const fresh = params.get('fresh') === '1'
    const saved = fresh ? null : readSaved()
    if (params.get('autoload') === '1') {
      void instance.load(variant).then(refresh)
    } else if (saved?.loaded) {
      // Returning to the page (or reloaded by the OS): reopen at the saved position.
      void instance.load(saved.variant, { scene: saved.scene, offset: saved.offset }, true).then(refresh)
    }
    refresh()
    return () => {
      unsubscribe()
      clearInterval(timer)
      viewport?.removeEventListener('resize', onViewport)
      viewport?.removeEventListener('scroll', onViewport)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true)
    setStatus(label)
    // Let the "busy" state paint before a long synchronous load.
    await new Promise((resolve) => setTimeout(resolve, 30))
    try {
      await action()
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  const load = (v: Variant) => {
    setVariant(v)
    setQuery('')
    return run(`loading variant ${v}`, () => coreRef.current!.load(v))
  }

  const switchVariant = (v: Variant) => {
    if (loaded) {
      const position = coreRef.current!.controller!.position()
      setVariant(v)
      void run(`loading variant ${v}`, () => coreRef.current!.load(v, position))
    } else {
      setVariant(v)
    }
  }

  const project = core?.project
  const quickResults = useMemo(() => {
    const needle = quick.trim().toLowerCase()
    if (!needle || !project) return []
    const out: { index: number; title: string; words: number }[] = []
    for (const scene of project.scenes) {
      if (scene.title.toLowerCase().includes(needle) || String(scene.index) === needle) {
        out.push({ index: scene.index, title: scene.title, words: scene.words })
        if (out.length >= 8) break
      }
    }
    return out
  }, [quick, project])

  const jump = (index: number, stamp?: number) => {
    setQuick('')
    void coreRef.current?.jump(index, 0, stamp)
  }

  const runFind = (text: string) => {
    setQuery(text)
    setMatchIndex(0)
    void coreRef.current?.find(text)
  }

  const step = (delta: number) => {
    const count = snap?.find?.count ?? 0
    if (!count) return
    const next = (matchIndex + delta + count) % count
    setMatchIndex(next)
    coreRef.current?.gotoMatch(next)
  }

  const copy = async () => {
    const text = coreRef.current?.copySelection() ?? ''
    try {
      await navigator.clipboard.writeText(text)
      setStatus(`copied ${text.length} chars`)
    } catch {
      setStatus(`copy blocked (${text.length} chars read from model)`)
    }
    setTimeout(() => setStatus(''), 2500)
  }

  const typing = snap?.typing
  const scroll = snap?.scroll
  const readout = snap
    ? [
        `variant ${snap.variant}${loaded ? '' : ' (not loaded)'}  editors mounted ${snap.mounted}  dom ${snap.dom ? snap.dom.elements + ' el / ' + snap.dom.textNodes + ' text' : '-'}  heap ${snap.heapMB === null ? 'n/a' : fmt(snap.heapMB, 1) + ' MB'}`,
        `typing (input to next frame) n=${typing?.n ?? 0}  p50 ${fmt(typing?.p50, 1)}  p95 ${fmt(typing?.p95, 1)}  p99 ${fmt(typing?.p99, 1)}  max ${fmt(typing?.max, 1)} ms`,
        `load ${fmt(snap.load?.totalMs)} ms (generate ${fmt(snap.load?.generateMs)}, build ${fmt(snap.load?.buildMs)}, cursor ${fmt(snap.load?.cursorMs)})  since nav ${fmt(snap.load?.sinceNavigationMs)} ms${snap.load?.restored ? '  [restored position]' : ''}`,
        `jump ${fmt(snap.jumpMs, 1)} ms   find ${snap.find ? `"${snap.find.query}" ${snap.find.count} in ${fmt(snap.find.ms, 1)} ms (painted ${fmt(snap.find.paintedMs, 1)})` : '-'}   copy ${snap.copy ? `${snap.copy.chars} chars ${fmt(snap.copy.ms, 1)} ms` : '-'}`,
        `scroll ${scroll ? `${scroll.kind}: max shift ${fmt(scroll.maxShiftPx, 2)} px (${scroll.shiftsOver1px} > 1 px of ${scroll.samples}), blank max ${fmt(scroll.maxBlankMs)} ms, frame p95 ${fmt(scroll.frameP95, 1)} max ${fmt(scroll.frameMax, 1)} ms, ${fmt(scroll.distancePx)} px` : '-'}`,
        `anchor ${snap.variant === 3 ? (snap.manualAnchor ? 'manual' : 'native') : 'native'}  overflow-anchor ${snap.overflowAnchor ? 'yes' : 'no'}  content-visibility ${snap.contentVisibility ? 'yes' : 'no'}  event-timing ${snap.hasEventTiming ? 'yes' : 'no'}${status ? '  | ' + status : ''}`,
      ].join('\n')
    : ''

  return (
    <div id="app">
      <header>
        <div className="row">
          {VARIANTS.map((v) => (
            <button key={v.id} className={variant === v.id ? 'on' : ''} disabled={busy} onClick={() => switchVariant(v.id)} data-variant={v.id}>
              {v.label}
            </button>
          ))}
          <button disabled={busy} onClick={() => load(variant)} id="load">
            {loaded ? 'Reload 300k' : 'Load 300k words'}
          </button>
          <button onClick={() => setShowReadout((on) => !on)}>{showReadout ? 'Hide' : 'Stats'}</button>
          <button className={showHelp ? 'on' : ''} onClick={() => setShowHelp((on) => !on)}>
            Checklist
          </button>
        </div>
        {(
          <>
            <div className="row">
              <input
                type="text"
                placeholder="Quick open: scene title or number"
                value={quick}
                onChange={(event) => setQuick(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && quickResults[0]) jump(quickResults[0].index, event.timeStamp)
                }}
                id="quick"
                disabled={!loaded}
                autoComplete="off"
              />
              <button disabled={!loaded} onPointerDown={keepFocus} onClick={(e) => jump(0, e.timeStamp)}>First</button>
              <button disabled={!loaded} onPointerDown={keepFocus} onClick={(e) => jump(project!.midScene, e.timeStamp)}>Mid</button>
              <button disabled={!loaded} onPointerDown={keepFocus} onClick={(e) => jump(project!.bigScene, e.timeStamp)}>10k</button>
              <button disabled={!loaded} onPointerDown={keepFocus} onClick={(e) => jump(project!.scenes.length - 1, e.timeStamp)}>Last</button>
            </div>
            {quickResults.length > 0 && (
              <div className="results">
                {quickResults.map((result) => (
                  <button key={result.index} onClick={(e) => jump(result.index, e.timeStamp)}>
                    {result.title} ({result.words} words)
                  </button>
                ))}
              </div>
            )}
            <div className="row">
              <input
                type="search"
                placeholder="Find in project"
                value={query}
                onChange={(event) => runFind(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') step(event.shiftKey ? -1 : 1)
                }}
                id="find"
                disabled={!loaded}
                autoComplete="off"
              />
              <span className="count" id="find-count">
                {snap?.find && query ? `${snap.find.count ? matchIndex + 1 : 0}/${snap.find.count}` : '0/0'}
              </span>
              <button disabled={!loaded} onClick={() => step(-1)}>Prev</button>
              <button disabled={!loaded} onClick={() => step(1)}>Next</button>
            </div>
          </>
        )}
        {showReadout && (
          <pre className="readout" id="readout">
            {readout}
          </pre>
        )}
      </header>

      {showHelp && (
        <div className="help">
          <p>
            <b>For each variant (1, 2, 3):</b> press the variant, then Load. Install to the Home Screen first on iPhone. Write down the stats lines
            after each step that has numbers.
          </p>
          <ol>
            <li>Tap into the text mid-project and type a paragraph. Lag? Dropped characters? (typing line: p50, p95, p99)</li>
            <li>Autocorrect, dictation, swipe typing. Android: compose with a non-Latin keyboard (for example Japanese).</li>
            <li>When the keyboard opens the caret stays visible and the page does not jump.</li>
            <li>The bottom toolbar (B, I, ...) stays just above the keyboard while scrolling and typing.</li>
            <li>Fling to the end and back by hand. Blank areas longer than a blink? Position jumps? Then press Slow scroll and Fling for numbers.</li>
            <li>Press Last, start typing at once. (jump line) Also try 10k, First and the quick-open box.</li>
            <li>Long-press to select, drag a handle across a scene boundary (the thin line between scenes), copy, paste into another app. Variant 3: also Select all, then Copy.</li>
            <li>Leave the app for a minute and return. Same position? The load line says [restored position] if the page had to reload.</li>
            <li>Variant 2 only: add ?v2fix=0 to the address, load, press Last, type. Does the text land at the caret or at the start of the next chapter?</li>
          </ol>
          <p>
            Address options: ?v=1|2|3 &amp;autoload=1 loads at once; &amp;anchor=native makes variant 3 use the browser's scroll anchoring; Unload forgets
            the saved position. Auto-type inserts 200 characters without the keyboard and reports the same typing numbers.
          </p>
        </div>
      )}

      <div id="scroller" ref={scrollerRef}>
        {!loaded && (
          <div className="empty">
            {busy ? (
              <p>Working: {status}</p>
            ) : (
              <>
                <p>
                  Spike A. Pick a variant, then press <b>Load 300k words</b>. The project (150 chapters, 600 scenes, one 10,000-word scene) is
                  generated in memory; nothing is stored except the last position.
                </p>
                <p>1: one editor for everything. 2: the same with content-visibility per chapter. 3: one editor per scene, only scenes near the screen are mounted.</p>
              </>
            )}
          </div>
        )}
        <div id="doc" ref={docRef} />
      </div>

      <footer>
        <button onPointerDown={keepFocus} onClick={() => coreRef.current?.controller?.toggleMark('strong')} disabled={!loaded}>
          <b>B</b>
        </button>
        <button onPointerDown={keepFocus} onClick={() => coreRef.current?.controller?.toggleMark('em')} disabled={!loaded}>
          <i>I</i>
        </button>
        <button onPointerDown={keepFocus} onClick={() => coreRef.current?.controller?.selectAll()} disabled={!loaded}>
          Select all
        </button>
        <button onPointerDown={keepFocus} onClick={copy} disabled={!loaded}>
          Copy
        </button>
        <button onPointerDown={keepFocus} onClick={() => run('auto-typing 200 characters', () => coreRef.current!.typeSynthetic(200))} disabled={!loaded || busy}>
          Auto-type
        </button>
        <button onClick={() => run('slow scroll test', () => coreRef.current!.scrollTest('slow'))} disabled={!loaded || busy}>
          Slow scroll
        </button>
        <button onClick={() => run('fling test', () => coreRef.current!.scrollTest('fling'))} disabled={!loaded || busy}>
          Fling
        </button>
        <button
          onPointerDown={keepFocus}
          onClick={() => {
            coreRef.current?.latency.reset()
            coreRef.current?.refreshDom()
            setTick((n) => n + 1)
          }}
        >
          Reset stats
        </button>
        <button
          onClick={() => {
            coreRef.current?.forget()
            coreRef.current?.unload()
            setTick((n) => n + 1)
          }}
        >
          Unload
        </button>
      </footer>
    </div>
  )
}
