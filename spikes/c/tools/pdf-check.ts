// Editor against PDF: paginate, write the PDF with the same writer the app uses, extract the PDF's
// text with poppler and check that every page holds exactly the paginator's rows, at the same rows
// and indents. Also reports PDF time (Bun/JavaScriptCore on this host), size and font embedding.
//   bun run tools/pdf-check.ts

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { parseFountain, toElementModel } from '../src/load/fountain'
import { paginate } from '../src/paginator/paginate'
import { pageItems } from '../src/paginator/layout'
import { afterwritingUsLetter, usFeature } from '../src/paginator/profiles'
import { writePdf } from '../src/pdf/writer'
import { generateStress } from '../src/fixtures/stress'
import { pdfLines } from './pdflines'
import type { Element, Page, Profile } from '../src/paginator/types'

const font = readFileSync('public/fonts/CourierPrime-Regular.ttf')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

async function check(name: string, els: Element[], p: Profile) {
  const res = paginate(els, p)
  let peak = process.memoryUsage().rss
  const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss) }, 5)
  const before = process.memoryUsage().rss
  const pdf = await writePdf(res.pages, p, font, name)
  clearInterval(timer)
  peak = Math.max(peak, process.memoryUsage().rss)
  mkdirSync('reference/out', { recursive: true })
  const file = `reference/out/${name}.${p.name}.ours.pdf`
  writeFileSync(file, pdf.bytes)
  const v = await verifyPdf(file, res.pages, p)
  const fonts = Bun.spawnSync(['pdffonts', file]).stdout.toString().split('\n').slice(2).filter(Boolean)
  return {
    name,
    profile: p.name,
    pages: res.pages.length,
    pdfPages: v.pdfPages,
    identicalPages: v.identicalPages,
    paginateMs: +(res.ms ?? 0).toFixed(1),
    pdfMs: +pdf.ms.toFixed(0),
    bytes: pdf.bytes.length,
    rssBeforeMB: +(before / 1048576).toFixed(0),
    rssPeakMB: +(peak / 1048576).toFixed(0),
    fonts: fonts.map((f) => f.replace(/\s+/g, ' ')),
    problems: v.problems,
  }
}

export async function verifyPdf(file: string, pages: Page[], p: Profile) {
  const res = { pages }
  const pdfPages = await pdfLines(file)
  let samePages = 0
  const problems: string[] = []
  for (let i = 0; i < res.pages.length; i++) {
    // expected rows: items on the same row joined left to right
    const want = new Map<number, { x: number; text: string }[]>()
    for (const it of pageItems(res.pages[i], p)) {
      if (!it.text.trim()) continue // a line of spaces prints nothing
      const a = want.get(it.row) ?? []
      const lead = it.text.length - it.text.trimStart().length
      a.push({ x: it.x + lead * p.charWidth, text: it.text })
      want.set(it.row, a)
    }
    const got = new Map<number, { x: number; text: string }>()
    for (const l of pdfPages[i]?.lines ?? []) {
      const row = Math.round((l.y / 72 - p.topMargin) / p.lineHeight)
      if (l.y < p.topMargin * 72 - 0.25 * 72 && !(p.contdInMargin && row === -1)) continue // page number
      got.set(row, { x: l.x / 72, text: l.text })
    }
    let ok = got.size === want.size
    for (const [row, its] of want) {
      its.sort((a, b) => a.x - b.x)
      const g = got.get(row)
      const wantText = norm(its.map((x) => x.text).join(' '))
      if (!g || norm(g.text) !== wantText || Math.abs(g.x - its[0].x) > 0.02) {
        ok = false
        if (problems.length < 5) problems.push(`page ${i + 1} row ${row}: want "${wantText.slice(0, 40)}" at ${its[0].x.toFixed(2)} got "${g?.text.slice(0, 40)}" at ${g?.x.toFixed(2)}`)
      }
    }
    if (ok) samePages++
  }
  return { pdfPages: pdfPages.length, identicalPages: samePages, problems }
}

if (import.meta.main) {
const out = []
const scripts: [string, Element[], Profile][] = [
  ['stress-120', toElementModel(parseFountain(generateStress(120, 7))), usFeature],
  ['stress-500', toElementModel(parseFountain(generateStress(500, 7))), usFeature],
]
if (existsSync('reference/in/big-fish.fountain')) {
  const bf = parseFountain(readFileSync('reference/in/big-fish.fountain', 'utf8'))
  scripts.push(['big-fish', toElementModel(bf), usFeature], ['big-fish', bf, afterwritingUsLetter])
}
for (const [n, els, p] of scripts) {
  const r = await check(n, els, p)
  out.push(r)
  console.log(JSON.stringify(r))
}
mkdirSync('reference/results', { recursive: true })
writeFileSync('reference/results/pdf-check.json', JSON.stringify(out, null, 1))
}
