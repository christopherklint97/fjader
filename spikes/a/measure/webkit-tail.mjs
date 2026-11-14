// WebKit only: which keystrokes are slow while typing 400 characters in the
// 500-word scene? Run with DPR=1 and DPR=2 to see whether the slow frames
// scale with the number of pixels painted (software rendering) or not.
// Usage: DPR=1 node measure/webkit-tail.mjs [variants=3,2]
import { serveDist, launch, openPage, sleep } from './lib.mjs'
const { server, origin } = await serveDist()
const browser = await launch('webkit')
const TEXT = 'the quick brown fox jumps over the lazy dog and runs back home again '.repeat(20).slice(0, 400)
try {
  for (const v of (process.argv[2] ?? '3,2').split(',')) {
    const { context, page } = await openPage(browser, 'webkit')
    await page.goto(`${origin}/?v=${v}&autoload=1&fresh=1`)
    await page.waitForFunction(() => window.__spike?.lastLoad, null, { timeout: 180000 })
    await sleep(800)
    await page.evaluate(() => window.__spike.latency.reset())
    await page.keyboard.type(TEXT, { delay: 80 })
    await sleep(500)
    const d = await page.evaluate(() => ({ samples: window.__spike.latency.samples, starts: window.__spike.latency.starts }))
    const slow = d.samples.map((ms, i) => ({ i, ms })).filter((x) => x.ms > 40)
    const sorted = [...d.samples].sort((a, b) => a - b)
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
    console.log(`DPR ${process.env.DPR ?? 2} variant ${v}: n=${d.samples.length} p50=${at(0.5)} p95=${at(0.95)} p99=${at(0.99)} max=${at(1)}; over 40 ms: ${slow.length}, median of those ${slow.length ? slow.map((x) => x.ms).sort((a, b) => a - b)[slow.length >> 1] : '-'}, keystroke numbers ${slow.length ? slow[0].i + '..' + slow[slow.length - 1].i : '-'}`)
    await context.close()
  }
} finally {
  await browser.close()
  server.close()
}
