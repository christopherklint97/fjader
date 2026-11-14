// For the owner's Final Draft check: compare our pagination of a script with a PDF that Final
// Draft exported for the same script, and measure Final Draft's character pitch in that PDF.
//   bun run tools/check-fd.ts <script.fountain|script.fdx> <final-draft.pdf> [--pitch=7.2]
// For an FDX the profile comes from the file's own settings; for Fountain the us-feature profile.

import { readFileSync } from 'node:fs'
import { parseFountain, toElementModel } from '../src/load/fountain'
import { parseFdx, profileFromFdx } from '../src/load/fdx'
import { usFeature } from '../src/paginator/profiles'
import { compare } from './compare'
import { pdfLines } from './pdflines'

const [src, pdf] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!src || !pdf) {
  console.log('usage: bun run tools/check-fd.ts <script.fountain|script.fdx> <final-draft.pdf> [--pitch=N]')
  process.exit(1)
}
const pages = await pdfLines(pdf)

// pitch: distance between word starts on the same row divided by the characters between them
const html = Bun.spawnSync(['pdftotext', '-bbox-layout', pdf, '-']).stdout.toString()
const pitches: number[] = []
for (const lm of html.matchAll(/<line[^>]*>([\s\S]*?)<\/line>/g)) {
  const ws = [...lm[1].matchAll(/<word xMin="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/g)].map((m) => ({ x: +m[1], t: m[2].replace(/&[a-z]+;/g, "'") }))
  for (let i = 1; i < ws.length; i++) {
    const per = (ws[i].x - ws[i - 1].x) / (ws[i - 1].t.length + 1)
    if (per > 5 && per < 8) pitches.push(per)
  }
}
pitches.sort((a, b) => a - b)
const measured = pitches[Math.floor(pitches.length / 2)]
const arg = process.argv.find((a) => a.startsWith('--pitch='))
const pitch = arg ? Number(arg.slice(8)) : measured
console.log(`Final Draft PDF: ${pages.length} pages; character pitch ${measured?.toFixed(3)} pt (median of ${pitches.length} word gaps; 7.2 = true 10 pitch)`)

const text = readFileSync(src, 'utf8')
const isFdx = /<FinalDraft/.test(text)
const els = isFdx ? parseFdx(text) : toElementModel(parseFountain(text))
for (const pt of [...new Set([7.2, pitch])]) {
  const p = isFdx ? profileFromFdx(text, 'fd-file', {}, pt) : { ...usFeature, charWidth: pt / 72, elements: Object.fromEntries(Object.entries(usFeature.elements).map(([k, st]) => [k, { ...st, width: Math.floor((st.width * 0.1) / (pt / 72) + 1e-6) }])) as typeof usFeature.elements }
  const r = compare(src, 'Final Draft', els, p, pages)
  console.log(`pitch ${pt.toFixed(3)} pt: ours ${r.ourPages} pages, Final Draft ${r.refPages}; identical pages ${r.identicalPages}/${r.refPages}; first divergence ${r.firstDivergence ?? '-'}; breaks agreeing when started where Final Draft starts ${r.independentAgree}/${r.independentBreaks}`)
}
