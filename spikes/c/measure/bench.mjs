// Main-thread benchmark of the paginator and PDF writer, so Chromium's CPU throttling applies.
// Usage: node measure/bench.mjs <chromium|webkit> [throttle]
import fs from 'node:fs'
import { serveDist, launch, openPage, outDir, loadAverage } from './lib.mjs'
const browserName = process.argv[2] ?? 'chromium'
const throttle = Number(process.argv[3] ?? 1)
const { server, origin } = await serveDist()
const browser = await launch(browserName)
const { page } = await openPage(browser, browserName, { throttle })
await page.goto(origin + '/?sample=rules')
await page.waitForFunction(() => window.__spike?.m.fullMs.length > 0, null, { timeout: 300000 })
const out = { browser: browserName, version: browser.version(), throttle, load: loadAverage(), runs: {} }
for (const s of ['stress-120', 'stress-500']) {
  out.runs[s] = await page.evaluate(([s]) => window.__spike.bench(s, 7, true), [s])
  console.log(s, JSON.stringify(out.runs[s]).slice(0, 400))
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(`${outDir}/bench-${browserName}-${throttle}x.json`, JSON.stringify(out, null, 1))
await browser.close(); server.close()
