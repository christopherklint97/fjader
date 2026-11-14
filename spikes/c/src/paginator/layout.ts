// Page layout: positions every printed line of a paginated page. The PDF writer and the viewer
// both use this, so neither re-flows anything.
// Dual-dialogue placement follows afterwriting's pdfmaker (MIT, Copyright (c) 2015-2020 Piotr Jamróz).

import type { Line, Page, Profile } from './types'

export interface Item {
  /** Body row on the page, 0-based. */
  row: number
  /** Inches from the left edge of the paper. */
  x: number
  text: string
  kind: Line['k']
}

const LEFT_MARGIN = 1.5
const RIGHT_MARGIN = 1.0

/** Text as printed: afterwriting strips its emphasis markers when drawing. */
export function printable(t: string, p: Profile): string {
  if (p.rules !== 'afterwriting') return t
  return t.replace(/\\\*/g, '\u0001').replace(/\\_/g, '\u0002').replace(/\*/g, '').replace(/_/g, '').replace(/\u0001/g, '*').replace(/\u0002/g, '_')
}

function xFor(l: Line, text: string, p: Profile): number {
  const kind = l.k === 'contd' ? 'character' : l.k === 'more' ? p.moreKind : l.k
  if (kind === 'blank' || kind === 'pad' || kind === 'page_break') return 0
  const st = p.elements[kind]
  let x = st.indent
  if (kind === 'parenthetical' && st.firstIndent && l.li === 0) x += st.firstIndent
  if (st.align === 'right') x = st.indent + st.width * p.charWidth - text.length * p.charWidth
  if (st.align === 'center') x = (p.pageWidth - text.length * p.charWidth) / 2
  if (l.dual) {
    x -= (x - LEFT_MARGIN) / 2
    if (l.dual === 'right') x += (p.pageWidth - RIGHT_MARGIN - LEFT_MARGIN) / 2
  }
  return x
}

export function pageItems(page: Page, p: Profile): Item[] {
  const items: Item[] = []
  const shift = page.start.carry && p.contdInMargin ? -1 : 0
  for (let i = 0; i < page.lines.length; i++) {
    const row = i + shift
    const l = page.lines[i]
    if (l.t) {
      const text = printable(l.t, p)
      items.push({ row, x: xFor(l, text, p), text, kind: l.k })
    }
    if (l.right) {
      for (let j = 0; j < l.right.length; j++) {
        const r = l.right[j]
        if (!r.t) continue
        const text = printable(r.t, p)
        items.push({ row: row + j, x: xFor({ ...r, dual: 'right' }, text, p), text, kind: r.k })
      }
    }
  }
  return items
}

/** Printed rows of a page: text items on the same row joined left to right. */
export function pageRows(page: Page, p: Profile): { row: number; text: string; kinds: Line['k'][] }[] {
  const byRow = new Map<number, Item[]>()
  for (const it of pageItems(page, p)) {
    const a = byRow.get(it.row)
    if (a) a.push(it)
    else byRow.set(it.row, [it])
  }
  return [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([row, its]) => {
      its.sort((a, b) => a.x - b.x)
      return { row, text: its.map((i) => i.text).join('  '), kinds: its.map((i) => i.kind) }
    })
}
