// Prints markdown tables from the result files.
// Usage: node measure/report.mjs [dir=spikes/a/results]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(process.argv[2] ?? path.join(here, '../results'))
const files = fs.readdirSync(dir).filter((f) => /^results-.*\.json$/.test(f)).sort()
const runs = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
const name = (run) => `${run.browser === 'chromium' ? 'Chromium' : 'WebKit'} ${run.browserVersion.split('.')[0]}, CPU ${run.browser === 'chromium' ? run.cpuThrottle + 'x' : '1x (no throttle)'}`
const r0 = (n) => (n === null || n === undefined || Number.isNaN(n) ? 'n/a' : Math.round(n).toString())
const r1 = (n) => (n === null || n === undefined || Number.isNaN(n) ? 'n/a' : n.toFixed(1))
const row = (cells) => `| ${cells.join(' | ')} |`
const table = (head, rows) => [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n')

const out = []
out.push('### Time from navigation to an editable cursor mid-project (ms)\n')
out.push(
  table(
    ['Run', 'Variant', 'median', 'max', 'n', 'generate fixture', 'build editor', 'place cursor (layout)'],
    runs.flatMap((run) =>
      Object.values(run.variants).filter((v) => v.load).map((v) => [name(run), v.variant, r0(v.load.sinceNavigationMs.p50), r0(v.load.sinceNavigationMs.max), v.load.sinceNavigationMs.n, r0(v.load.generateMs.p50), r0(v.load.buildMs.p50), r0(v.load.cursorMs.p50)]),
    ),
  ),
)

out.push('\n### Keystroke latency, key received to next frame (ms)\n')
const typingRows = []
for (const run of runs) {
  for (const v of Object.values(run.variants)) {
    for (const [label, t] of [
      ['500-word scene', v.typingMid],
      ['10,000-word scene', v.typingBig],
    ]) {
      if (!t) continue
      const et = t.eventTiming
      typingRows.push([
        name(run),
        v.variant,
        label,
        t.frame.n,
        r1(t.frame.p50),
        r1(t.frame.p95),
        r1(t.frame.p99),
        r1(t.frame.max),
        et ? `${et.p95 <= 16 ? '≤16' : r0(et.p95)} / ${et.p99 <= 16 ? '≤16' : r0(et.p99)} (${et.under16ms} of ${et.n} under 16)` : 'n/a',
        t.intact ? 'yes' : 'NO',
      ])
    }
  }
}
out.push(table(['Run', 'Variant', 'Where', 'n', 'p50', 'p95', 'p99', 'max', 'Event Timing p95 / p99', 'text intact'], typingRows))

out.push('\n### Jump to a scene, call to next frame (ms): first visit / median of 5 / max\n')
const jumpCell = (j) => (j ? `${r0(j.firstVisit)} / ${r0(j.p50)} / ${r0(j.max)}` : 'n/a')
out.push(
  table(
    ['Run', 'Variant', 'first scene', 'middle scene', 'last scene', '10,000-word scene', 'never-visited scenes (5 different)'],
    runs.flatMap((run) => Object.values(run.variants).filter((v) => v.jump).map((v) => [name(run), v.variant, jumpCell(v.jump.first), jumpCell(v.jump.middle), jumpCell(v.jump.last), jumpCell(v.jump.big10k), jumpCell(v.jump.neverVisited)])),
  ),
)

out.push('\n### Scroll stability\n')
const scrollRows = []
for (const run of runs) {
  for (const v of Object.values(run.variants)) {
    const sets = [
      ['', v.scroll],
      [' (browser anchoring)', v.scrollNativeAnchor],
      [' (no anchoring, control)', v.scrollNoAnchorControl],
    ]
    for (const [suffix, set] of sets) {
      if (!set) continue
      for (const [kind, s] of Object.entries(set)) {
        // During a browser-driven scroll the test cannot tell the browser's own
        // anchoring adjustments from real movement, so the shift is not reported
        // where the browser anchors (variant 2, and variant 3 with browser anchoring).
        const unmeasurable = kind === 'touchFling' && (v.variant === 2 || suffix.includes('browser'))
        scrollRows.push([
          name(run),
          v.variant + suffix,
          kind === 'touchFling' ? 'touch flicks' : kind === 'fling' ? 'scripted fling' : kind === 'into10k' ? 'scripted, up into the 10k scene' : 'scripted slow',
          r0(s.distancePx),
          unmeasurable ? 'n/m' : s.maxShiftPx.toFixed(2),
          unmeasurable ? 'n/m' : `${s.shiftsOver1px} of ${s.samples}`,
          s.mounts ?? '-',
          s.corrections ?? '-',
          r0(s.maxBlankMs),
          r0(s.frameP95),
          r0(s.frameMax),
          s.layoutShiftEntries ?? '-',
        ])
      }
    }
  }
}
out.push(table(['Run', 'Variant', 'Scroll', 'px', 'max shift px', 'frames > 1 px', 'mounts', 'scrollTop corrections', 'longest blank ms', 'frame p95 ms', 'frame max ms', 'LayoutShift entries'], scrollRows))

out.push('\n### Size\n')
out.push(
  table(
    ['Run', 'Variant', 'editors mounted', 'DOM elements', 'text nodes', 'JS heap after load MB', 'JS heap after use MB', 'renderer RSS after load MB', 'renderer RSS after use MB'],
    runs.flatMap((run) =>
      Object.values(run.variants).map((v) => [
        name(run),
        v.variant,
        v.afterLoad.mounted,
        v.afterLoad.dom.elements,
        v.afterLoad.dom.textNodes,
        r1(v.afterLoad.jsHeapUsedMB),
        r1(v.afterVisitingAll?.jsHeapUsedMB ?? v.afterUse?.jsHeapUsedMB) + (v.afterVisitingAll ? ' (all 600 scenes opened)' : ''),
        r0(v.afterLoad.rendererRssMB),
        r0(v.afterVisitingAll?.rendererRssMB ?? v.afterUse?.rendererRssMB),
      ]),
    ),
  ),
)

out.push('\n### In-app find for "the" (ms)\n')
out.push(
  table(
    ['Run', 'Variant', 'matches', 'compute median', 'compute max', 'to painted count median', 'to painted count max'],
    runs.flatMap((run) => Object.values(run.variants).filter((v) => v.find).map((v) => [name(run), v.variant, v.find.count, r1(v.find.computeMs.p50), r1(v.find.computeMs.max), r1(v.find.paintedMs.p50), r1(v.find.paintedMs.max)])),
  ),
)

out.push('\n### Run conditions\n')
out.push(
  table(
    ['Run', 'browser version', 'started', 'load average start / end', 'cgroup CPU-throttled time during run (s)'],
    runs.map((run) => [name(run), run.browserVersion, run.started, `${run.host.loadAverageStart?.[0]} / ${run.host.loadAverageEnd?.[0]}`, r1((run.host.cgroupThrottledMs ?? NaN) / 1000)]),
  ),
)
console.log(out.join('\n'))
