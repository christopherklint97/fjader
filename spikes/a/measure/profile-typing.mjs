// Where does a keystroke's time go? Chromium only. Records a trace while typing
// in each variant and sums main-thread CPU time (thread time, so other load on
// the host does not distort it) per kind of work.
// Usage: node measure/profile-typing.mjs [throttle=1] [chars=120]
import fs from 'node:fs'
import path from 'node:path'
import { serveDist, launch, openPage, sleep, outDir } from './lib.mjs'

const throttle = Number(process.argv[2] ?? 1)
const chars = Number(process.argv[3] ?? 120)
const TEXT = 'the quick brown fox jumps over the lazy dog and runs back home again '.repeat(10).slice(0, chars)
const NAMES = ['RunTask', 'EventDispatch', 'FunctionCall', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'HitTest', 'MinorGC', 'MajorGC', 'FireAnimationFrame', 'IntersectionObserverController::computeIntersections']
const { server, origin } = await serveDist()
const browser = await launch('chromium')
const rows = []
try {
  for (const variant of [1, 2, 3]) {
    const { context, page } = await openPage(browser, 'chromium', { throttle })
    await page.goto(`${origin}/?v=${variant}&autoload=1&fresh=1`)
    await page.waitForFunction(() => window.__spike?.lastLoad, null, { timeout: 300000 })
    await sleep(1500)
    await page.evaluate(() => {
      const s = window.__spike
      const scene = s.project.midScene
      return s.jump(scene, Math.floor(s.project.scenes[scene].chars / 2))
    })
    await sleep(800)
    await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'v8'] })
    await page.keyboard.type(TEXT, { delay: 80 })
    await sleep(300)
    const trace = JSON.parse((await browser.stopTracing()).toString())
    const events = trace.traceEvents ?? trace
    // The renderer main thread is the one that dispatched the key events.
    const mainThreads = new Map()
    for (const e of events) if (e.name === 'EventDispatch' && e.args?.data?.type === 'keydown') mainThreads.set(`${e.pid}:${e.tid}`, (mainThreads.get(`${e.pid}:${e.tid}`) ?? 0) + 1)
    const main = [...mainThreads.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const totals = Object.fromEntries(NAMES.map((n) => [n, 0]))
    const other = new Map()
    for (const e of events) {
      if (e.ph !== 'X' || `${e.pid}:${e.tid}` !== main) continue
      const cpu = (e.tdur ?? e.dur ?? 0) / 1000
      if (e.name in totals) totals[e.name] += cpu
      else other.set(e.name, (other.get(e.name) ?? 0) + cpu)
    }
    const perKey = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, +(v / chars).toFixed(2)]))
    const topOther = [...other.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}=${(v / chars).toFixed(2)}`)
    rows.push({ variant, throttle, chars, cpuMsPerKey: perKey, largestOtherEvents: topOther })
    console.log(`variant ${variant}:`, JSON.stringify(perKey))
    console.log('   other:', topOther.join(' '))
    await context.close()
  }
} finally {
  await browser.close()
  server.close()
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, `profile-typing-${throttle}x.json`), JSON.stringify(rows, null, 2))
