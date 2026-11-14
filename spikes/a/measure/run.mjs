// Automated measurements for spike A.
// Usage: node measure/run.mjs <chromium|webkit> [throttle=1] [variants=1,2,3] [label]
// Writes measure/out/results-<browser>-<throttle>x[-label].json
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { serveDist, launch, openPage, sleep, outDir, loadAverage, PHONE } from './lib.mjs'

const browserName = process.argv[2] ?? 'chromium'
const throttle = Number(process.argv[3] ?? 1)
const variants = (process.argv[4] ?? '1,2,3').split(',').map(Number)
const label = process.argv[5] ?? ''
const LOAD_RUNS = Number(process.env.LOAD_RUNS ?? 5)
const TYPE_CHARS = Number(process.env.TYPE_CHARS ?? 500)
const TYPE_DELAY = Number(process.env.TYPE_DELAY ?? 80)
const SKIP = new Set((process.env.SKIP ?? '').split(',').filter(Boolean))

const TEXT = 'the quick brown fox jumps over the lazy dog and runs back home again '.repeat(20).slice(0, TYPE_CHARS)

// ---- host bookkeeping ---------------------------------------------------------
function cgroupCpuStat() {
  try {
    const rel = fs.readFileSync('/proc/self/cgroup', 'utf8').trim().split('::')[1]
    const text = fs.readFileSync(path.join('/sys/fs/cgroup', rel, 'cpu.stat'), 'utf8')
    const stat = Object.fromEntries(text.trim().split('\n').map((line) => line.split(' ')))
    return { nrThrottled: Number(stat.nr_throttled ?? 0), throttledMs: Number(stat.throttled_usec ?? 0) / 1000 }
  } catch {
    return null
  }
}

function descendantRss(namePattern) {
  // Largest resident set among our descendant processes whose name matches.
  const procs = new Map()
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const stat = fs.readFileSync(`/proc/${entry}/stat`, 'utf8')
      const close = stat.lastIndexOf(')')
      const comm = stat.slice(stat.indexOf('(') + 1, close)
      const ppid = Number(stat.slice(close + 2).split(' ')[1])
      procs.set(Number(entry), { comm, ppid })
    } catch {
      /* process went away */
    }
  }
  const isDescendant = (pid) => {
    for (let p = pid, hops = 0; p > 1 && hops < 40; hops++) {
      if (p === process.pid) return true
      p = procs.get(p)?.ppid ?? 0
    }
    return false
  }
  let best = 0
  for (const [pid, info] of procs) {
    if (!isDescendant(pid)) continue
    let cmdline = ''
    try {
      cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    } catch {
      continue
    }
    if (!namePattern.test(info.comm + ' ' + cmdline)) continue
    try {
      const rss = Number(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1] ?? 0)
      best = Math.max(best, rss / 1024)
    } catch {
      /* ignore */
    }
  }
  return best || null
}

const rendererRss = () => descendantRss(browserName === 'chromium' ? /--type=renderer/ : /WebKitWebProcess/)

function pct(sorted, p) {
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]
}
function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return { n: sorted.length, min: sorted[0] ?? null, p50: pct(sorted, 50), p95: pct(sorted, 95), p99: pct(sorted, 99), max: sorted[sorted.length - 1] ?? null }
}

// ---- pieces ---------------------------------------------------------------------
const { server, origin } = await serveDist()
const browser = await launch(browserName)
const url = (variant, extra = '') => `${origin}/?v=${variant}&autoload=1&fresh=1${extra}`

async function loadOnce(variant, extra = '') {
  const { context, page, cdp } = await openPage(browser, browserName, { throttle })
  await page.goto(url(variant, extra))
  await page.waitForFunction(() => window.__spike?.lastLoad, null, { timeout: 300000 })
  const load = await page.evaluate(() => window.__spike.lastLoad)
  return { context, page, cdp, load }
}

async function heap(cdp, page) {
  if (!cdp) return { jsHeapUsedMB: null, note: 'no heap API in WebKit automation' }
  await cdp.send('HeapProfiler.enable')
  await cdp.send('HeapProfiler.collectGarbage')
  await sleep(200)
  await cdp.send('Performance.enable')
  const { metrics } = await cdp.send('Performance.getMetrics')
  const get = (name) => metrics.find((m) => m.name === name)?.value ?? null
  return { jsHeapUsedMB: get('JSHeapUsedSize') / 1048576, jsHeapTotalMB: get('JSHeapTotalSize') / 1048576, cdpNodes: get('Nodes') }
}

async function typeTest(page, scene, offset) {
  await page.evaluate(([scene, offset]) => window.__spike.jump(scene, offset), [scene, offset])
  await sleep(500)
  await page.evaluate(() => {
    window.__spike.latency.reset()
    window.__spike.timings.reset()
  })
  const before = await page.evaluate((scene) => window.__spike.controller.sceneText(scene).length, scene)
  const throttled0 = cgroupCpuStat()
  const wall0 = Date.now()
  await page.keyboard.type(TEXT, { delay: TYPE_DELAY })
  await sleep(800)
  const wallMs = Date.now() - wall0
  const throttled1 = cgroupCpuStat()
  const data = await page.evaluate((scene) => {
    const s = window.__spike
    return {
      samples: s.latency.samples,
      starts: s.latency.starts,
      events: s.timings.events.filter((e) => ['keydown', 'keypress', 'beforeinput', 'input', 'textInput'].includes(e.name)),
      hasEventTiming: s.timings.hasEventTiming,
      text: s.controller.sceneText(scene),
      mounted: s.controller.mountedCount(),
    }
  }, scene)
  // Event Timing: per keystroke, the latest presentation time of any of its
  // events. Events shorter than 16 ms are not reported by the API.
  let eventTiming = null
  if (data.hasEventTiming) {
    const durations = []
    let unreported = 0
    for (let i = 0; i < data.starts.length; i++) {
      const from = data.starts[i] - 0.5
      const to = i + 1 < data.starts.length ? data.starts[i + 1] - 0.5 : Infinity
      let end = null
      for (const e of data.events) if (e.start >= from && e.start < to) end = Math.max(end ?? 0, e.start + e.duration)
      if (end === null) unreported++
      else durations.push(end - data.starts[i])
    }
    // Unreported keystrokes were faster than 16 ms; count them as 16 (upper bound).
    const all = [...durations, ...new Array(unreported).fill(16)]
    eventTiming = { ...summarize(all), reported: durations.length, under16ms: unreported }
  }
  return {
    scene,
    chars: TEXT.length,
    delayMs: TYPE_DELAY,
    wallMs,
    frame: summarize(data.samples),
    eventTiming,
    intact: data.text.includes(TEXT),
    grewBy: data.text.length - before,
    mounted: data.mounted,
    cgroupThrottledMs: throttled0 && throttled1 ? throttled1.throttledMs - throttled0.throttledMs : null,
  }
}

async function jumpTest(page, project) {
  const targets = { last: project.scenes - 1, first: 0, middle: project.midScene, big10k: project.bigScene }
  const out = { last: [], first: [], middle: [], big10k: [], neverVisited: [] }
  for (let round = 0; round < 5; round++) {
    for (const [name, scene] of Object.entries(targets)) {
      out[name].push(await page.evaluate((scene) => window.__spike.jump(scene, 0), scene))
      await sleep(250)
    }
    out.neverVisited.push(await page.evaluate((scene) => window.__spike.jump(scene, 0), 137 + round * 11))
    await sleep(250)
  }
  const result = {}
  for (const [name, values] of Object.entries(out)) result[name] = { firstVisit: values[0], ...summarize(values), values }
  return result
}

async function scrollTests(page, cdp) {
  const out = {}
  const shifts = async () => page.evaluate(() => window.__spike.timings.layoutShifts.length)
  // Start in a part of the project that has never been rendered, so heights
  // above the viewport are estimates: the hard case for scroll stability.
  // (Scene 193 is chosen because several scenes just above it have estimates
  // that are off by a line or two at this width, so corrections are exercised.)
  await page.evaluate(() => window.__spike.jump(193, 0))
  await sleep(600)
  let before = await shifts()
  out.slow = await page.evaluate(() => window.__spike.scrollTest('slow'))
  out.slow.layoutShiftEntries = (await shifts()) - before
  await page.evaluate(() => window.__spike.jump(450, 0))
  await sleep(600)
  before = await shifts()
  out.fling = await page.evaluate(() => window.__spike.scrollTest('fling'))
  out.fling.layoutShiftEntries = (await shifts()) - before
  // Variant 3: scroll up into the 10,000-word scene, the most expensive single
  // mount. Start far enough below it that it is not mounted as overscan first.
  const start = await page.evaluate(() => {
    const s = window.__spike
    const c = s.controller
    if (!c.slots) return null
    const big = s.project.bigScene
    const bottom = c.slots[big].offsetTop + c.slots[big].offsetHeight
    let k = 1
    while (big + k < c.slots.length - 1 && c.slots[big + k].offsetTop - bottom < 2.5 * s.scroller.clientHeight) k++
    return big + k
  })
  if (start !== null) {
    await page.evaluate((scene) => window.__spike.jump(scene, 0), start)
    await sleep(600)
    const mountedBefore = await page.evaluate(() => window.__spike.controller.views.has(window.__spike.project.bigScene))
    out.into10k = await page.evaluate(() => window.__spike.scrollTest('up'))
    out.into10k.bigSceneMountedBefore = mountedBefore
    out.into10k.bigSceneMountedAfter = await page.evaluate(() => window.__spike.controller.views.has(window.__spike.project.bigScene))
  }
  if (cdp) {
    // Real touch flicks: raw touch events, so the browser's own gesture
    // recogniser scrolls and flings on the compositor, not script.
    await page.evaluate(() => window.__spike.jump(330, 0))
    await sleep(600)
    const box = await page.evaluate(() => {
      const r = window.__spike.scroller.getBoundingClientRect()
      return { x: r.left + r.width / 2, top: r.top, height: r.height }
    })
    const flick = async (fromY, toY) => {
      const steps = 5
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: fromY, id: 1 }] })
      for (let i = 1; i <= steps; i++) {
        await sleep(6)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x, y: fromY + ((toY - fromY) * i) / steps, id: 1 }] })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    const high = box.top + box.height * 0.15
    const low = box.top + box.height * 0.9
    before = await shifts()
    await page.evaluate(() => window.__spike.passiveStart('touch-fling'))
    const top0 = await page.evaluate(() => window.__spike.scroller.scrollTop)
    // Finger moves down: the page scrolls up, into scenes that were never measured.
    for (let i = 0; i < 4; i++) {
      await flick(high, low)
      await sleep(180)
    }
    await sleep(2500)
    const top1 = await page.evaluate(() => window.__spike.scroller.scrollTop)
    for (let i = 0; i < 4; i++) {
      await flick(low, high)
      await sleep(180)
    }
    await sleep(2500)
    const top2 = await page.evaluate(() => window.__spike.scroller.scrollTop)
    out.touchFling = await page.evaluate(() => window.__spike.passiveStop())
    out.touchFling.layoutShiftEntries = (await shifts()) - before
    out.touchFling.scrolledUpPx = top1 - top0
    out.touchFling.scrolledDownPx = top2 - top1
  }
  return out
}

async function runVariant(variant) {
  console.log(`\n== ${browserName} ${throttle}x variant ${variant} (load ${loadAverage()})`)
  const result = { variant }

  // A. cold loads: new context each time (no HTTP or code cache)
  if (!SKIP.has('load')) {
    const loads = []
    for (let i = 0; i < LOAD_RUNS; i++) {
      const { context, load } = await loadOnce(variant)
      loads.push(load)
      await context.close()
    }
    result.load = {
      sinceNavigationMs: summarize(loads.map((l) => l.sinceNavigationMs)),
      totalMs: summarize(loads.map((l) => l.totalMs)),
      generateMs: summarize(loads.map((l) => l.generateMs)),
      buildMs: summarize(loads.map((l) => l.buildMs)),
      cursorMs: summarize(loads.map((l) => l.cursorMs)),
      editable: loads.every((l) => l.editable),
    }
    console.log('load since navigation', JSON.stringify(result.load.sinceNavigationMs))
  }

  const { context, page, cdp } = await loadOnce(variant)
  const project = await page.evaluate(() => ({ scenes: window.__spike.project.scenes.length, midScene: window.__spike.project.midScene, bigScene: window.__spike.project.bigScene, midChars: window.__spike.project.scenes[window.__spike.project.midScene].chars, bigChars: window.__spike.project.scenes[window.__spike.project.bigScene].chars }))
  await sleep(500)

  // B. size after load
  result.afterLoad = {
    dom: await page.evaluate(() => {
      window.__spike.refreshDom()
      return window.__spike.dom
    }),
    mounted: await page.evaluate(() => window.__spike.controller.mountedCount()),
    ...(await heap(cdp, page)),
    rendererRssMB: rendererRss(),
  }
  console.log('after load', JSON.stringify(result.afterLoad))

  // C. typing
  if (!SKIP.has('type')) {
    result.typingMid = await typeTest(page, project.midScene, Math.floor(project.midChars / 2))
    console.log('typing 500-word scene', JSON.stringify(result.typingMid))
    result.typingBig = await typeTest(page, project.bigScene, Math.floor(project.bigChars / 2))
    console.log('typing 10k scene', JSON.stringify(result.typingBig))
  }

  // D. jumps
  if (!SKIP.has('jump')) {
    result.jump = await jumpTest(page, project)
    console.log('jump', JSON.stringify(Object.fromEntries(Object.entries(result.jump).map(([k, v]) => [k, { first: Math.round(v.firstVisit), p50: Math.round(v.p50), max: Math.round(v.max) }]))))
  }

  // F. find
  if (!SKIP.has('find')) {
    const finds = []
    for (let i = 0; i < 5; i++) {
      finds.push(await page.evaluate(() => window.__spike.find('the')))
      await page.evaluate(() => window.__spike.find(''))
      await sleep(100)
    }
    result.find = { query: 'the', count: finds[0].count, computeMs: summarize(finds.map((f) => f.ms)), paintedMs: summarize(finds.map((f) => f.paintedMs)) }
    console.log('find', JSON.stringify(result.find))
  }

  // E. scrolling
  if (!SKIP.has('scroll')) {
    result.scroll = await scrollTests(page, cdp)
    for (const [name, r] of Object.entries(result.scroll)) {
      console.log(`scroll ${name}`, JSON.stringify({ maxShiftPx: +r.maxShiftPx.toFixed(2), over1px: r.shiftsOver1px, samples: r.samples, maxBlankMs: Math.round(r.maxBlankMs), blankFrames: r.blankFrames, frameP95: Math.round(r.frameP95), frameMax: Math.round(r.frameMax), px: Math.round(r.distancePx), layoutShifts: r.layoutShiftEntries, mounts: r.mounts, unmounts: r.unmounts, corrections: r.corrections }))
    }
    result.debugAfterScroll = await page.evaluate(() => window.__spike.controller.debug())
  }

  // G. size after use; for variant 3 also after every scene has been opened once
  result.afterUse = { ...(await heap(cdp, page)), rendererRssMB: rendererRss(), mounted: await page.evaluate(() => window.__spike.controller.mountedCount()) }
  if (variant === 3 && !SKIP.has('visitall')) {
    const visitMs = await page.evaluate(() => {
      const s = window.__spike
      const t = performance.now()
      for (let i = 0; i < s.project.scenes.length; i++) s.controller.jumpToScene(i, 0)
      return performance.now() - t
    })
    await sleep(500)
    result.afterVisitingAll = {
      visitAllMs: visitMs,
      ...(await heap(cdp, page)),
      rendererRssMB: rendererRss(),
      mounted: await page.evaluate(() => window.__spike.controller.mountedCount()),
      docsBuilt: await page.evaluate(() => window.__spike.controller.debug().docsBuilt),
    }
    const copy = await page.evaluate(() => {
      const s = window.__spike
      s.controller.selectAll()
      const t = performance.now()
      const text = s.controller.selectionText()
      const ms = performance.now() - t
      s.controller.clearCross()
      return { ms, chars: text.length }
    })
    result.selectAllCopy = copy
    console.log('after visiting all', JSON.stringify(result.afterVisitingAll), 'select-all copy', JSON.stringify(copy))
  }
  console.log('after use', JSON.stringify(result.afterUse))
  await context.close()

  // Variant 3 with the browser's own scroll anchoring instead of manual correction.
  if (variant === 3 && !SKIP.has('scroll') && !SKIP.has('native')) {
    const native = await loadOnce(3, '&anchor=native')
    await sleep(500)
    result.scrollNativeAnchor = await scrollTests(native.page, native.cdp)
    for (const [name, r] of Object.entries(result.scrollNativeAnchor)) {
      console.log(`scroll(native anchor) ${name}`, JSON.stringify({ maxShiftPx: +r.maxShiftPx.toFixed(2), over1px: r.shiftsOver1px, samples: r.samples, maxBlankMs: Math.round(r.maxBlankMs), frameP95: Math.round(r.frameP95), layoutShifts: r.layoutShiftEntries, mounts: r.mounts }))
    }
    await native.context.close()
    // Control: no correction of any kind. Shows that the scroll test does see
    // the shift that anchoring removes.
    const off = await loadOnce(3, '&anchor=off')
    await sleep(500)
    await off.page.evaluate(() => window.__spike.jump(193, 0))
    await sleep(600)
    result.scrollNoAnchorControl = { slow: await off.page.evaluate(() => window.__spike.scrollTest('slow')) }
    await off.page.evaluate(() => window.__spike.jump(450, 0))
    await sleep(600)
    result.scrollNoAnchorControl.fling = await off.page.evaluate(() => window.__spike.scrollTest('fling'))
    for (const [name, c] of Object.entries(result.scrollNoAnchorControl)) {
      console.log(`scroll(no anchoring, control) ${name}`, JSON.stringify({ maxShiftPx: +c.maxShiftPx.toFixed(2), over1px: c.shiftsOver1px, samples: c.samples, mounts: c.mounts }))
    }
    await off.context.close()
  }
  return result
}

const started = new Date().toISOString()
const cpu0 = cgroupCpuStat()
const report = {
  started,
  browser: browserName,
  browserVersion: browser.version(),
  cpuThrottle: browserName === 'chromium' ? throttle : 'not available',
  viewport: PHONE,
  host: { model: (() => { try { return fs.readFileSync('/proc/device-tree/model', 'utf8').replace(/\0/g, '') } catch { return os.hostname() } })(), cpus: os.cpus().length, arch: os.arch(), loadAverageStart: loadAverage() },
  typing: { chars: TYPE_CHARS, delayMs: TYPE_DELAY },
  variants: {},
}
try {
  for (const variant of variants) report.variants[variant] = await runVariant(variant)
} finally {
  await browser.close()
  server.close()
}
const cpu1 = cgroupCpuStat()
report.finished = new Date().toISOString()
report.host.loadAverageEnd = loadAverage()
report.host.cgroupThrottledMs = cpu0 && cpu1 ? cpu1.throttledMs - cpu0.throttledMs : null
fs.mkdirSync(outDir, { recursive: true })
const file = path.join(outDir, `results-${browserName}-${throttle}x${label ? '-' + label : ''}.json`)
fs.writeFileSync(file, JSON.stringify(report, null, 2))
console.log('\nwrote', file)
