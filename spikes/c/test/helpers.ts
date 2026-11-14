import type { Element, ElementType, Page, PaginateResult, Profile } from '../src/paginator/types'
import { pageItems } from '../src/paginator/layout'

let n = 0
export const E = (type: ElementType, text: string, dual?: 'left' | 'right'): Element => {
  const el: Element = { id: 't' + n++, type, text }
  if (dual) el.dual = dual
  return el
}

/** An action paragraph of exactly `lines` lines that cannot split (no sentence ends). */
export const filler = (lines: number) => E('action', Array.from({ length: lines }, (_, i) => 'filler line ' + i).join('\n'))

export const lastContent = (page: Page) => {
  for (let i = page.lines.length - 1; i >= 0; i--) {
    const l = page.lines[i]
    if (l.t && l.k !== 'more') return l
  }
  return undefined
}
export const firstContent = (page: Page) => page.lines.find((l) => l.t && l.k !== 'contd')

/** Invariants every fd-rule pagination must hold. Returns a list of violations. */
export function checkInvariants(res: PaginateResult, elements: Element[], p: Profile): string[] {
  const bad: string[] = []
  const SENT = /([.!?]+["'”’)\]]*)$/
  res.pages.forEach((page, pi) => {
    const items = pageItems(page, p)
    const maxRow = Math.max(-1, ...items.map((i) => i.row))
    const minRow = Math.min(0, ...items.map((i) => i.row))
    const limit = p.linesPerPage - 1 + (p.moreInMargin ? 1 : 0)
    if (maxRow > limit) bad.push(`page ${pi + 1}: row ${maxRow} beyond ${limit}`)
    if (minRow < (p.contdInMargin ? -1 : 0)) bad.push(`page ${pi + 1}: row ${minRow} above the body`)
    const isLast = pi === res.pages.length - 1
    if (isLast) return
    const last = lastContent(page)
    if (!last) return
    if (['scene_heading', 'shot', 'character', 'contd'].includes(last.k)) bad.push(`page ${pi + 1}: ends with ${last.k} "${last.t}"`)
    if (last.k === 'parenthetical' && !p.parentheticalBeforeMore) bad.push(`page ${pi + 1}: ends with a parenthetical`)
    const endsMore = page.lines[page.lines.length - 1]?.k === 'more'
    const next = res.pages[pi + 1]
    if (endsMore) {
      // speech split: at least minDialogueBefore lines here, carry on the next page
      let i = page.lines.length - 2
      let before = 0
      while (i >= 0 && page.lines[i].k !== 'character' && page.lines[i].k !== 'contd') {
        if (page.lines[i].k === 'dialogue') before++
        i--
      }
      if (before < p.minDialogueBefore) bad.push(`page ${pi + 1}: ${before} dialogue lines before (MORE)`)
      const carry = next.lines[0]
      if (carry.k !== 'contd' || !carry.t.toUpperCase().includes(p.contd.toUpperCase())) bad.push(`page ${pi + 2}: no NAME (CONT'D) after (MORE)`)
      let after = 0
      for (let j = 1; j < next.lines.length; j++) {
        const l = next.lines[j]
        if (l.k === 'dialogue') after++
        else if (l.k !== 'parenthetical') break
      }
      if (after < p.minDialogueAfter) bad.push(`page ${pi + 2}: ${after} dialogue lines after (CONT'D)`)
    } else if (last.k === 'action' || last.k === 'dialogue') {
      const nf = next.lines[0]
      if (nf && nf.e === last.e && nf.k === last.k && nf.t) {
        // action split inside a paragraph
        let here = 0
        for (const l of page.lines) if (l.e === last.e && l.k === last.k) here++
        let there = 0
        for (const l of next.lines) if (l.e === last.e && l.k === last.k) there++
        if (here < p.minActionBefore || there < p.minActionAfter) bad.push(`page ${pi + 1}: action split ${here}/${there}`)
        if (p.breakAtSentences && !SENT.test(last.t.trim())) bad.push(`page ${pi + 1}: split not at a sentence end: "${last.t}"`)
      }
    }
    // dual blocks never split across pages
    for (const l of page.lines) if (l.right && l.dual === 'left') {
      const idx = page.lines.indexOf(l)
      if (idx + l.right.length > page.lines.length) bad.push(`page ${pi + 1}: dual block cut`)
    }
  })
  // no text lost or duplicated: every element's words appear exactly once, in order
  const words = new Map<number, string[]>()
  for (const page of res.pages) {
    for (const l of page.lines) {
      const all = l.right ? [l, ...l.right] : [l]
      for (const x of all) {
        if (x.e < 0 || x.k === 'contd' || x.k === 'more' || x.k === 'blank' || x.k === 'pad') continue
        const a = words.get(x.e) ?? []
        a.push(...x.t.split(/\s+/).filter(Boolean))
        words.set(x.e, a)
      }
    }
  }
  elements.forEach((el, i) => {
    if (el.type === 'page_break') return
    const want = el.text.replace(/\s+/g, '')
    const got = (words.get(i) ?? []).join('')
    if (got !== want) bad.push(`element ${i} text changed: "${want.slice(0, 40)}" vs "${got.slice(0, 40)}"`)
  })
  return bad
}

export function pagesSignature(res: PaginateResult): string[] {
  return res.pages.map((pg) => pg.lines.map((l) => l.k + ':' + l.t + (l.right ? '|' + l.right.map((r) => r.t).join('/') : '')).join('\n'))
}
