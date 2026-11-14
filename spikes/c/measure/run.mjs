// Automated measurements for spike C, against the production build.
// Usage: node measure/run.mjs <chromium|webkit> [throttle=1]
// Writes measure/out/results-<browser>-<throttle>x.json
import fs from 'node:fs'
import { serveDist, launch, openPage, sleep, outDir, loadAverage } from './lib.mjs'

const browserName = process.argv[2] ?? 'chromium'
const throttle = Number(process.argv[3] ?? 1)
const RUNS = Number(process.env.RUNS ?? 5)
const TYPE = ' and then she said something new.'

// resident memory of all our descendant processes (the browser), sampled during PDF export
function treeRss() {
  const procs = new Map()
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const stat = fs.readFileSync(`/proc/${entry}/stat`, 'utf8')
      const close = stat.lastIndexOf(')')
      const rest = stat.slice(close + 2).split(' ')
      procs.set(Number(entry), { ppid: Number(rest[1]), rss: Number(rest[21]) * 4096, comm: stat.slice(stat.indexOf('(') + 1, close) })
    } catch {}
  }
  const isDesc = (pid) => {
    for (let p = pid, h = 0; p > 1 && h < 40; h++) {
      if (p === process.pid) return true
      p = procs.get(p)?.ppid ?? 0
    }
    return false
  }
  let total = 0
  let maxProc = 0
  for (const [pid, info] of procs) {
    if (pid === process.pid || !isDesc(pid)) continue
    total += info.rss
    maxProc = Math.max(maxProc, info.rss)
  }
  return { total, maxProc }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null }
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10)

const { server, origin } = await serveDist()
const browser = await launch(browserName)
const { page } = await openPage(browser, browserName, { throttle })
const results = { browser: browserName, version: browser.version(), throttle, load: loadAverage(), when: new Date().toISOString(), scripts: {} }

async function loadScript(sample) {
  await page.goto(origin + '/?sample=' + sample)
  await page.waitForFunction(() => window.__spike?.m.fullMs.length > 0, null, { timeout: 300000 })
  await sleep(500)
}

for (const sample of ['stress-120', 'stress-500']) {
  const res = {}
  await loadScript(sample)
  res.pages = await page.evaluate(() => window.__spike.m.pageCount())
  res.elements = await page.evaluate(() => window.__spike.elementCount())
  res.firstLoadMs = r1(await page.evaluate(() => window.__spike.m.fullMs[0]))
  // full pagination in the worker (no rendering), RUNS times
  for (let i = 0; i < RUNS; i++) {
    await page.evaluate(() => window.__spike.repaginate())
    await page.waitForFunction((n) => window.__spike.m.repaginateMs.length > n, i, { timeout: 300000 })
  }
  const rep = await page.evaluate(() => window.__spike.m.repaginateMs)
  res.fullMs = { median: r1(median(rep)), min: r1(Math.min(...rep)), max: r1(Math.max(...rep)), runs: rep.map(r1) }

  // incremental: type at the start, middle and end
  res.typing = {}
  const count = res.elements
  for (const [where, frac] of [['start', 0.02], ['middle', 0.5], ['end', 0.97]]) {
    // pick an action or dialogue element near that position
    const idx = await page.evaluate((target) => window.__spike.findEditable(target), Math.floor(count * frac))
    await page.evaluate((i) => window.__spike.edit(i), idx)
    await page.evaluate(() => { window.__spike.m.updates.length = 0; window.__spike.m.inputToFrame.length = 0 })
    await page.locator('#ed-text').press('End')
    await page.keyboard.type(TYPE, { delay: 80 })
    await sleep(800)
    const d = await page.evaluate(() => ({ u: window.__spike.m.updates, f: window.__spike.m.inputToFrame }))
    const ms = d.u.map((x) => x.ms)
    const rt = d.u.map((x) => x.roundTrip)
    res.typing[where] = {
      element: idx,
      keys: TYPE.length,
      updates: d.u.length,
      workerMs: { median: r1(median(ms)), p95: r1(pct(ms, 0.95)), max: r1(Math.max(...ms)) },
      roundTripMs: { median: r1(median(rt)), p95: r1(pct(rt, 0.95)), max: r1(Math.max(...rt)) },
      inputToFrameMs: { median: r1(median(d.f)), p95: r1(pct(d.f, 0.95)), max: r1(Math.max(...d.f)) },
      recomputedPages: median(d.u.map((x) => x.recomputed)),
      resynced: d.u.filter((x) => x.resynced).length,
      coalescedMax: Math.max(...d.u.map((x) => x.coalesced)),
      pagesAfter: d.u[d.u.length - 1]?.pages,
    }
  }
  await page.evaluate(() => document.getElementById('ed-close').click())

  // PDF in the worker
  res.pdf = []
  for (let i = 0; i < 3; i++) {
    await sleep(500)
    const base = treeRss()
    let peak = base.total
    let peakProc = base.maxProc
    const timer = setInterval(() => { const r = treeRss(); peak = Math.max(peak, r.total); peakProc = Math.max(peakProc, r.maxProc) }, 25)
    const n = await page.evaluate(() => window.__spike.m.pdf.length)
    await page.evaluate(() => window.__spike.exportPdf())
    await page.waitForFunction((k) => window.__spike.m.pdf.length > k, n, { timeout: 600000 })
    clearInterval(timer)
    const p = await page.evaluate(() => window.__spike.m.pdf[window.__spike.m.pdf.length - 1])
    res.pdf.push({ workerMs: r1(p.ms), totalMs: r1(p.totalMs), cloneMs: r1(p.cloneMs), bytes: p.bytes, pages: p.pages, rssBaseMB: Math.round(base.total / 1048576), rssPeakDeltaMB: Math.round((peak - base.total) / 1048576), largestProcPeakMB: Math.round(peakProc / 1048576) })
  }
  results.scripts[sample] = res
  console.log(sample, JSON.stringify(res))
}
results.loadAfter = loadAverage()
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(`${outDir}/results-${browserName}-${throttle}x.json`, JSON.stringify(results, null, 1))
await browser.close()
server.close()
