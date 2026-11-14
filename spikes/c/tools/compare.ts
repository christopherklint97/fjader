// Comparison: the paginator against reference PDFs.
//   bun run tools/compare.ts [--verbose]
// References:
//   afterwriting: reference/out/<name>.aw.pdf, made by afterwriting 1.17.3's CLI (see tools/afterwriting-ref.sh)
//   Final Draft:  reference/in/<name>.fd.pdf, the Final Draft PDFs fountain.io publishes with each FDX
// Per script: page counts; "pages identical" = same first and last content row on the page;
// "breaks agreeing when started from the reference's page start" = each page cut independently
// (isolates rule differences from drift).

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { parseFountain, toElementModel } from '../src/load/fountain'
import { parseFdx, profileFromFdx } from '../src/load/fdx'
import { paginate, nextPage, contdText } from '../src/paginator/paginate'
import { pageRows, printable } from '../src/paginator/layout'
import { afterwritingUsLetter, usFeature } from '../src/paginator/profiles'
import type { Element, Line, Page, Profile } from '../src/paginator/types'
import { pdfLines, type PdfPage } from './pdflines'

// Final Draft's PDFs place characters 6.995 pt apart (measured with tools/fd-pitch, all three PDFs), not 7.2 pt
const FD_PITCH = Number(process.argv.find((a) => a.startsWith('--pitch='))?.slice(8) ?? 6.995)
const OVR = JSON.parse(process.argv.find((a) => a.startsWith('--ovr='))?.slice(6) ?? '{}')
const verbose = process.argv.includes('--verbose')
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const isCarry = (t: string) => /^\(more\)$/.test(t) || /\(cont'?d\)$/.test(t) || /^\(continued\)$/.test(t) || /^continued:/.test(t)

function sigRows(rows: string[]): { first: string; last: string; rows: string[] } {
  const c = rows.map(norm).filter((t) => t && !isCarry(t))
  return { first: c[0] ?? '', last: c[c.length - 1] ?? '', rows: c }
}

function refPages(pdf: PdfPage[]): string[][] {
  // drop the header row (page number at 0.5 in)
  return pdf.map((pg) => pg.lines.filter((l) => l.y > 0.85 * 72).map((l) => l.text))
}

function ourPages(pages: Page[], p: Profile): string[][] {
  return pages.map((pg) => pageRows(pg, p).map((r) => r.text))
}

const same = (a: string, b: string) => a === b || (a.length > 12 && b.length > 12 && (a.startsWith(b) || b.startsWith(a)))

interface Diff { page: number; ref: string; ours: string; ourKind?: string; context?: string }

export interface Result {
  script: string
  reference: string
  profile: string
  ourPages: number
  refPages: number
  identicalPages: number
  rowsIdenticalPages: number
  skippedRefPages: number[]
  firstDivergence: number | null
  independentBreaks: number
  independentAgree: number
  independentDiffs: Diff[]
  located: number
}

function lastContentKind(page: Page): string {
  for (let i = page.lines.length - 1; i >= 0; i--) {
    const l = page.lines[i]
    if (l.t && l.k !== 'more') return `${l.k}${l.n > 1 ? ` line ${l.li + 1}/${l.n}` : ''}`
  }
  return ''
}

export function compare(script: string, reference: string, elements: Element[], p: Profile, refPdf: PdfPage[]): Result {
  const res = paginate(elements, p)
  const ours = ourPages(res.pages, p).map(sigRows)
  let ref = refPages(refPdf).map(sigRows)
  // skip reference pages before the script starts (title page, epigraph)
  const start = ref.findIndex((r) => same(r.first, ours[0].first))
  if (start > 0) ref = ref.slice(start)
  let identical = 0
  let rowsIdentical = 0
  let firstDiv: number | null = null
  const skippedRef: number[] = []
  // walk both; a reference page with no counterpart (afterwriting's PDFKit overflow pages) is
  // skipped if the next pages line up again within three pages
  const pageSame = (o: (typeof ours)[0] | undefined, r: (typeof ref)[0] | undefined) => !!o && !!r && same(o.first, r.first) && same(o.last, r.last)
  for (let k = 0, j = 0; k < ours.length && j < ref.length; k++, j++) {
    if (!pageSame(ours[k], ref[j])) {
      let s = 1
      while (s <= 3 && !(pageSame(ours[k], ref[j + s]) && pageSame(ours[k + 1], ref[j + s + 1]))) s++
      if (s <= 3) {
        for (let q = 0; q < s; q++) skippedRef.push(j + q + 1)
        j += s
      }
    }
    if (pageSame(ours[k], ref[j])) {
      identical++
      if (ours[k].rows.length === ref[j].rows.length && ours[k].rows.every((t, i) => same(t, ref[j].rows[i]))) rowsIdentical++
    } else if (firstDiv === null) firstDiv = k + 1
  }

  // independent breaks: start each page where the reference page starts
  const stream = res.stream
  const normStream = stream.map((l) => norm(printable(l.t, p)))
  let pos = 0
  let agree = 0
  let located = 0
  const diffs: Diff[] = []
  for (let k = 0; k < ref.length - 1; k++) {
    const r = ref[k]
    // locate the page start: the first three content rows must follow each other in the stream
    const seqMatch = (j: number) => {
      let m = 0
      for (let q = j; q < stream.length && m < Math.min(3, r.rows.length); q++) {
        if (!normStream[q] || isCarry(normStream[q])) continue
        if (!same(normStream[q], r.rows[m]) && !(stream[q].right && r.rows[m].startsWith(normStream[q]))) return false
        m++
      }
      return true
    }
    let i = -1
    for (let j = pos; j < stream.length; j++) {
      if (normStream[j] && stream[j].k !== 'blank' && (same(normStream[j], r.first) || (stream[j].right && r.first.startsWith(normStream[j]))) && seqMatch(j)) { i = j; break }
    }
    if (i === -1) continue
    located++
    pos = i + 1
    // carried speech: reference page starts with a (CONT'D) row
    const rawFirst = refPages(refPdf)[k + Math.max(start, 0)].map(norm).find((t) => t) ?? ''
    let carry: Line | null = null
    // a real character element whose name ends in (cont'd) starts the page: start there, not after it
    if (i > 0 && stream[i - 1].k === 'character' && same(normStream[i - 1], rawFirst)) i--
    else if (/\(cont'?d\)$/.test(rawFirst) && (stream[i].k === 'dialogue' || stream[i].k === 'parenthetical') && stream[i - 1]?.k !== 'character') {
      let c = i
      while (c > 0 && stream[c].k !== 'character') c--
      carry = { t: contdText(stream[c].t, p), k: 'contd', r: 'dialogue', e: stream[c].e, li: -1, n: 0 }
    }
    const np = nextPage({ stream, elements, p }, { cursor: i, carry, rest: null })
    if (!np) continue
    const o = sigRows(pageRows(np.page, p).map((x) => x.text))
    if (same(o.last, r.last)) agree++
    else
      diffs.push({
        page: k + 1,
        ref: r.last,
        ours: o.last,
        ourKind: lastContentKind(np.page),
        context: `ref page rows ${r.rows.length}, ours ${o.rows.length}`,
      })
  }
  return {
    script,
    reference,
    profile: p.name,
    ourPages: res.pages.length,
    refPages: ref.length,
    identicalPages: identical,
    rowsIdenticalPages: rowsIdentical,
    skippedRefPages: skippedRef,
    firstDivergence: firstDiv,
    independentBreaks: ref.length - 1,
    independentAgree: agree,
    independentDiffs: diffs,
    located,
  }
}

if (import.meta.main) {
  const IN = 'reference/in'
  const OUT = 'reference/out'
  const results: Result[] = []
  const fountains = ['brick-and-steel', 'the-last-birthday-card', 'big-fish', 'aw-test', 'aw-printing-trouble', 'aw-my-living-memory', 'stress-30', 'stress-120', 'stress-500']
  for (const name of fountains) {
    if (only && !name.includes(only)) continue
    const src = `${IN}/${name}.fountain`
    const ref = `${OUT}/${name}.aw.pdf`
    if (!existsSync(src) || !existsSync(ref)) { console.log('missing', name); continue }
    const els = parseFountain(readFileSync(src, 'utf8'))
    results.push(compare(name, 'afterwriting 1.17.3', els, afterwritingUsLetter, await pdfLines(ref)))
  }
  for (const name of ['brick-and-steel', 'the-last-birthday-card', 'big-fish']) {
    if (only && !name.includes(only)) continue
    const fdx = readFileSync(`${IN}/${name}.fdx`, 'utf8')
    const p = profileFromFdx(fdx, `fd-${name}`, OVR, FD_PITCH)
    results.push(compare(name, 'Final Draft (fountain.io PDF, 2012)', parseFdx(fdx), p, await pdfLines(`${IN}/${name}.fd.pdf`)))
  }
  console.log('| Script | Reference | Ours | Ref | Identical pages (first+last row) | All rows identical | Ref pages skipped | First divergence | Independent breaks agreeing |')
  console.log('|---|---|---|---|---|---|---|---|---|')
  for (const r of results) {
    const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '-') + '%'
    console.log(`| ${r.script} | ${r.reference} | ${r.ourPages} | ${r.refPages} | ${r.identicalPages}/${r.refPages} (${pct(r.identicalPages, r.refPages)}) | ${r.rowsIdenticalPages} | ${r.skippedRefPages.join(' ') || '-'} | ${r.firstDivergence ?? '-'} | ${r.independentAgree}/${r.independentBreaks} (${pct(r.independentAgree, r.independentBreaks)}) located ${r.located} |`)
    if (verbose) for (const d of r.independentDiffs) console.log(`    p${d.page}: ref ends "${d.ref.slice(0, 50)}" | ours "${d.ours.slice(0, 50)}" [${d.ourKind}] ${d.context}`)
  }
  // predicted page counts for the owner's manual Final Draft check (Fountain import, default template)
  console.log('\nPredicted page counts, us-feature profile (fd rules, Final Draft default element settings, 54 lines):')
  const predicted: Record<string, number> = {}
  for (const name of fountains) {
    if (!existsSync(`${IN}/${name}.fountain`)) continue
    const els = toElementModel(parseFountain(readFileSync(`${IN}/${name}.fountain`, 'utf8')))
    predicted[name] = paginate(els, usFeature).pages.length
    console.log(`  ${name}: ${predicted[name]}`)
  }
  mkdirSync('reference/results', { recursive: true })
  writeFileSync('reference/results/compare.json', JSON.stringify({ results, predicted }, null, 1))
}
