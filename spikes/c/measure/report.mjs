// Summarise measure/out/*.json into measure/out/summary.md (tables for the results file).
import fs from 'node:fs'
import { outDir } from './lib.mjs'

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] }
const f = (x) => (x == null || Number.isNaN(x) ? '-' : x < 10 ? x.toFixed(1) : Math.round(x).toString())
const label = (d) => `${d.browser === 'chromium' ? 'Chromium' : 'WebKit'} ${d.version}, CPU ${d.throttle}x`
const lines = []
const read = (n) => (fs.existsSync(`${outDir}/${n}`) ? JSON.parse(fs.readFileSync(`${outDir}/${n}`, 'utf8')) : null)
const configs = [['chromium', 1], ['chromium', 4], ['webkit', 1]]

lines.push('### Worker, as the app runs it (Chromium throttling does not reach workers, so the 4x rows show 1x worker speed)', '')
lines.push('| Browser | Script | Pages | Full pagination, median (max) ms | First load incl. layout rows ms | Typing at start / middle / end: worker ms median (p95) | Round trip median (p95) | Input to next frame median (p95) | PDF worker ms (3 runs) | PDF size | Browser RSS rise during PDF |')
lines.push('|---|---|---|---|---|---|---|---|---|---|---|')
for (const [b, t] of configs) {
  const d = read(`results-${b}-${t}x.json`)
  if (!d) continue
  for (const [s, r] of Object.entries(d.scripts)) {
    const ty = r.typing
    const w = ['start', 'middle', 'end'].map((k) => `${f(ty[k].workerMs.median)} (${f(ty[k].workerMs.p95)})`).join(' / ')
    const rt = ['start', 'middle', 'end'].map((k) => `${f(ty[k].roundTripMs.median)} (${f(ty[k].roundTripMs.p95)})`).join(' / ')
    const i2f = ['start', 'middle', 'end'].map((k) => `${f(ty[k].inputToFrameMs.median)} (${f(ty[k].inputToFrameMs.p95)})`).join(' / ')
    lines.push(`| ${label(d)} | ${s} | ${r.pages} | ${f(r.fullMs.median)} (${f(r.fullMs.max)}) | ${f(r.firstLoadMs)} | ${w} | ${rt} | ${i2f} | ${r.pdf.map((p) => f(p.workerMs)).join(', ')} | ${(r.pdf[0].bytes / 1024).toFixed(0)} KB | ${Math.max(...r.pdf.map((p) => p.rssPeakDeltaMB))} MB |`)
  }
}
lines.push('', '### Same code on the main thread (where Chromium 4x throttling applies)', '')
lines.push('| Browser | Script | Pages | Full pagination median (max) ms, 7 runs | Incremental edit start / middle / end, median (p95) ms, 33 edits each | PDF write ms (2 runs) |')
lines.push('|---|---|---|---|---|---|')
for (const [b, t] of configs) {
  const d = read(`bench-${b}-${t}x.json`)
  if (!d) continue
  for (const [s, r] of Object.entries(d.runs)) {
    const e = ['start', 'middle', 'end'].map((k) => `${f(med(r.edits[k]))} (${f(p95(r.edits[k]))})`).join(' / ')
    lines.push(`| ${label(d)} | ${s} | ${r.pages} | ${f(med(r.full))} (${f(Math.max(...r.full))}) | ${e} | ${r.pdfMs.map(f).join(', ')} |`)
  }
}
fs.writeFileSync(`${outDir}/summary.md`, lines.join('\n') + '\n')
console.log(lines.join('\n'))
