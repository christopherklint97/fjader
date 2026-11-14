// Screenplay paginator: elements + profile -> pages of lines. Pure, no DOM; runs in a Worker.
//
// The "afterwriting" rule set is a hand port of afterwriting's liner
// (https://github.com/ifrost/afterwriting-labs, js/utils/liner.js: default_breaker, break_lines,
// fold_dual_dialogue, line; commit f1912c08d0905bac42e1805830a1e72f98b88c2f).
// Original: Copyright (c) 2015-2020 Piotr Jamróz. MIT License:
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software
//   and associated documentation files (the "Software"), to deal in the Software without
//   restriction, including without limitation the rights to use, copy, modify, merge, publish,
//   distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
//   Software is furnished to do so, subject to the following conditions:
//   The above copyright notice and this permission notice shall be included in all copies or
//   substantial portions of the Software.
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
//
// Changes from the original: iterative page loop over a window (no array slicing or splicing, no
// mutation of shared lines), so a page depends only on where it starts; this is what makes the
// incremental mode possible. Quirks of the original are kept on purpose in this rule set (see
// docs/spikes/results/C.md). The "fd" rule set (Final Draft-like) is new code written for this spike.

import type { Element, ElementType, Line, Page, PageStart, PaginateResult, Profile } from './types'
import { wrapWithOffsets, type Wrapped } from './wrap'

// ---------------------------------------------------------------------------------------------
// Line stream

const wrapCache = new WeakMap<Element, { key: string; w: Wrapped }>()

function styleOf(el: { type: ElementType; dual?: 'left' | 'right' }, p: Profile) {
  const style = p.elements[el.type as Exclude<ElementType, 'page_break'>] ?? p.elements.action
  let width = style.width
  let firstWidth: number | undefined
  if (style.firstIndent) firstWidth = width + Math.round(-style.firstIndent / p.charWidth)
  if (el.dual) {
    width = Math.floor(width * p.dualWidthFactor)
    if (firstWidth !== undefined) firstWidth = Math.floor(firstWidth * p.dualWidthFactor)
  }
  return { style, width, firstWidth }
}

function wrapElement(el: Element, p: Profile): Wrapped {
  const { width, firstWidth } = styleOf(el, p)
  const key = p.name + '|' + width + '|' + firstWidth + '|' + el.text
  const hit = wrapCache.get(el)
  if (hit && hit.key === key) return hit.w
  const w = wrapWithOffsets(el.text, width, { firstWidth, breakHyphens: p.hyphenBreaks })
  wrapCache.set(el, { key, w })
  return w
}

export function buildStream(elements: Element[], p: Profile): { stream: Line[]; elementStart: Int32Array } {
  const stream: Line[] = []
  const elementStart = new Int32Array(elements.length + 1)
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (el.type === 'page_break') {
      stream.push({ t: '', k: 'page_break', r: 'page_break', e: i, li: 0, n: 1 })
      continue
    }
    const style = p.elements[el.type] ?? p.elements.action
    const blanks = p.sourceSpacing && el.blankBefore !== undefined ? el.blankBefore : style.spaceBefore
    for (let b = 0; b < blanks; b++) stream.push({ t: '', k: 'blank', r: 'separator', e: i, li: -1, n: 0 })
    const wrapped = wrapElement(el, p)
    const n = wrapped.lines.length
    for (let li = 0; li < n; li++) {
      const line: Line = { t: wrapped.lines[li], k: el.type, r: el.type, e: i, li, n, o: wrapped.starts[li] }
      if (el.dual) line.dual = el.dual
      stream.push(line)
    }
  }
  if (p.rules === 'afterwriting') foldDualAfterwriting(stream)
  else foldDualFd(stream)
  // first stream index of each element's lines, after dual folding (right columns are not in the stream)
  let k = 0
  for (let s = 0; s < stream.length; s++) {
    const e = stream[s].e
    while (k <= e && k < elements.length) elementStart[k++] = s
  }
  while (k <= elements.length) elementStart[k++] = stream.length
  return { stream, elementStart }
}

const isDlg = (l: Line | undefined) => !!l && (l.r === 'character' || l.r === 'parenthetical' || l.r === 'dialogue')

/** afterwriting fold_dual_dialogue: right column lines (plus one following line) move onto the left character line. */
function foldDualAfterwriting(stream: Line[]) {
  for (let i = 0; i < stream.length; i++) {
    const l = stream[i]
    if (l.r !== 'character' || l.dual !== 'left' || l.li !== 0 || l.right) continue
    let r = -1
    for (let j = i; j < stream.length; j++) {
      if (stream[j].r === 'character' && stream[j].dual === 'right') { r = j; break }
    }
    if (r === -1) break
    let count = 0
    while (r + count < stream.length && isDlg(stream[r + count])) count++
    count++ // afterwriting also takes the separator after the right column
    l.right = stream.splice(r, count)
  }
}

/**
 * fd rules: a dual block is one unit as tall as its taller column. The right column moves onto
 * the left character line; if it is taller, invisible pad lines keep the height right.
 */
function foldDualFd(stream: Line[]) {
  for (let i = 0; i < stream.length; i++) {
    const l = stream[i]
    if (l.r !== 'character' || l.dual !== 'left' || l.li !== 0 || l.right) continue
    let leftEnd = i
    while (leftEnd + 1 < stream.length && stream[leftEnd + 1].dual === 'left') leftEnd++
    let r = leftEnd + 1
    while (r < stream.length && stream[r].k === 'blank') r++
    if (r >= stream.length || stream[r].dual !== 'right') continue
    let rEnd = r
    while (rEnd + 1 < stream.length && stream[rEnd + 1].dual === 'right') rEnd++
    const right = stream.slice(r, rEnd + 1)
    const leftLen = leftEnd - i + 1
    stream.splice(leftEnd + 1, rEnd + 1 - (leftEnd + 1))
    l.right = right
    const pads: Line[] = []
    for (let k = leftLen; k < right.length; k++) pads.push({ t: '', k: 'pad', r: 'dialogue', e: l.e, li: -1, n: 0, dual: 'left' })
    if (pads.length) stream.splice(leftEnd + 1, 0, ...pads)
  }
}

// ---------------------------------------------------------------------------------------------
// Window: the remaining lines from a page start. Head lines (a carried CONT'D name, re-wrapped
// rest of a split paragraph) come first, then the stream from cursor.

class Win {
  stream: Line[]
  cursor: number
  head: Line[]
  length: number
  constructor(stream: Line[], cursor: number, head: Line[]) {
    this.stream = stream
    this.cursor = cursor
    this.head = head
    this.length = stream.length - cursor + head.length
  }
  get(i: number): Line {
    const h = this.head.length
    return i < h ? this.head[i] : this.stream[this.cursor + i - h]
  }
  /** Stream index of window line i (only meaningful for i >= head.length). */
  abs(i: number): number {
    return this.cursor + i - this.head.length
  }
}

interface Split {
  /** Window index of the line the page ends with (it may be shortened to `prefix`). */
  index: number
  /** Shortened text of line `index` (fd sentence split), or null to keep it whole. */
  prefix: string | null
  /** Add (MORE) and carry NAME (CONT'D). */
  more: boolean
  /** Window index of the speech's character line (for (CONT'D) and dual right columns). */
  character: number
  /** Re-wrapped rest of the split element, printed first on the next page. */
  rest: Line[]
  /** Window index where the stream resumes on the next page. */
  resume: number
}

type Decision = false | true | Split

const hasText = (l: Line) => l.t !== '' || l.k === 'pad'

// ---------------------------------------------------------------------------------------------
// afterwriting default_breaker, ported. "Can the page end after line index?"

function breakerAfterwriting(index: number, w: Win): Decision {
  let before = index - 1
  while (before && !w.get(before).t) before--
  let after = index + 1
  while (after < w.length && !w.get(after).t) after++
  const on = w.get(index)
  const ta = after < w.length ? w.get(after) : undefined
  const tb = w.get(before)

  if (on.r === 'scene_heading' && ta && ta.r !== 'scene_heading') return false
  else if (ta && ta.r === 'transition' && on.r !== 'transition') return false
  // action block of 1-3 lines: break only after its last line
  else if (on.r === 'action' && on.n < 4 && on.li !== on.n - 1) return false
  // 4+ lines: not after the first or the penultimate line
  else if (on.r === 'action' && on.n >= 4 && (on.li === 0 || on.li === on.n - 2)) return false
  // split_dialogue (on by default). The original also tests token_on_break.dual, which is a
  // token property read from a line object, so it is always undefined: dual dialogue is split too.
  else if (on.r === 'dialogue' && ta && ta.r === 'dialogue' && tb.r === 'dialogue') {
    let character = before
    while (character > 0 && w.get(character).k !== 'character' && w.get(character).k !== 'contd') character--
    // (MORE) goes where line `index` was; that line moves to the next page
    return { index: index - 1, prefix: null, more: true, character, rest: [], resume: index }
  } else if (isDlg(on) && ta && (ta.r === 'dialogue' || ta.r === 'parenthetical')) return false
  return true
}

// ---------------------------------------------------------------------------------------------
// fd rules (new): Final Draft-like behaviour, calibrated against Final Draft PDFs; see the results file.

/** End of a sentence: . ! ? (with closing quotes or brackets), followed by a space. */
const SENTENCE_END = /[.!?]+["'”’)\]]*(?= )/g

function speechStart(w: Win, index: number): number {
  let c = index
  while (c > 0 && !(w.get(c).k === 'character' || w.get(c).k === 'contd')) c--
  return c
}

/** Dialogue lines of the speech after window index `from` (exclusive), up to the end of the speech. */
function dialogueLinesAfter(w: Win, from: number, skipElement: number): number {
  let n = 0
  for (let i = from + 1; i < w.length; i++) {
    const l = w.get(i)
    if (l.e === skipElement && l.k !== 'blank') continue
    if (l.r === 'dialogue') n++
    else if (l.r !== 'parenthetical') break
  }
  return n
}

function breakerFd(index: number, w: Win, p: Profile, max: number, elements: Element[]): Decision {
  const on = w.get(index)
  let after = index + 1
  while (after < w.length && !hasText(w.get(after))) after++
  const ta = after < w.length ? w.get(after) : undefined
  if (!ta) return true

  // Final Draft 8 leaves a parenthetical above (MORE) (Big Fish, page 30); the spec's rule forbids it
  if (on.k === 'parenthetical' && p.parentheticalBeforeMore && ta.r === 'dialogue' && !ta.dual && !on.dual) {
    if (index + 1 >= max + (p.moreInMargin ? 1 : 0)) return false
    const c = speechStart(w, index)
    let before = 0
    for (let i = c + 1; i <= index; i++) if (w.get(i).k === 'dialogue') before++
    const rest = dialogueLinesAfter(w, index, -1)
    if (before < p.minDialogueBefore || rest < p.minDialogueAfter) return false
    return { index, prefix: null, more: true, character: c, rest: [], resume: index + 1 }
  }
  // keep-with-next elements
  if (on.k === 'scene_heading' || on.k === 'shot' || on.k === 'character' || on.k === 'contd' || on.k === 'parenthetical') return false
  // a transition stays with what it follows
  if (ta.k === 'transition') return false

  // dual dialogue is one unit
  if (on.dual || on.k === 'pad') return !(ta.dual || ta.k === 'pad')

  const inside = ta.e === on.e && ta.k === on.k
  if ((on.k === 'action' || on.k === 'dialogue') && inside) return splitInside(index, w, p, max, elements)

  if (on.k === 'dialogue' && (ta.r === 'dialogue' || ta.r === 'parenthetical') && !ta.dual) {
    // speech continues with another element: split between elements
    if (index + 1 >= max + (p.moreInMargin ? 1 : 0)) return false
    const c = speechStart(w, index)
    let before = 0
    for (let i = c + 1; i <= index; i++) if (w.get(i).k === 'dialogue') before++
    const rest = dialogueLinesAfter(w, index, -1)
    if (before < p.minDialogueBefore || rest < p.minDialogueAfter) return false
    return { index, prefix: null, more: true, character: c, rest: [], resume: index + 1 }
  }
  return true
}

/** Split an action or dialogue element inside itself, after line `index` or at a sentence end within it. */
function splitInside(index: number, w: Win, p: Profile, max: number, elements: Element[]): Decision {
  const on = w.get(index)
  const el = elements[on.e]
  const text = el.text
  const lineStart = on.o ?? 0
  const lineEnd = lineStart + on.t.length
  let cut = -1
  if (p.breakAtSentences) {
    const seg = text.substring(lineStart, lineEnd + 1)
    SENTENCE_END.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SENTENCE_END.exec(seg))) {
      const c = lineStart + m.index + m[0].length
      if (c <= lineEnd) cut = c
    }
    if (cut === -1) return false
  } else {
    cut = lineEnd
  }
  const restText = text.substring(cut).replace(/^\s+/, '')
  if (!restText) return false
  const prefix = text.substring(lineStart, cut).replace(/\s+$/, '')
  if (!prefix) return false // nothing of this line stays: that is a break after the previous line

  // lines of this element that stay on the page
  let above = 0
  for (let i = index; i >= 0 && w.get(i).e === on.e && w.get(i).k === on.k; i--) above++
  const { width } = styleOf(el, p)
  const restWrapped = wrapWithOffsets(restText, width, { breakHyphens: p.hyphenBreaks })
  const restBase = text.length - restText.length
  const n = restWrapped.lines.length
  const rest: Line[] = restWrapped.lines.map((t, li) => ({ t, k: on.k, r: on.r, e: on.e, li, n, o: restBase + restWrapped.starts[li] }))
  // where the stream resumes: after the element's remaining lines
  let resume = index + 1
  while (resume < w.length && w.get(resume).e === on.e && w.get(resume).k === on.k) resume++

  if (on.k === 'action') {
    if (above < p.minActionBefore || n < p.minActionAfter) return false
    return { index, prefix, more: false, character: -1, rest, resume }
  }
  // dialogue
  if (index + 1 >= max + (p.moreInMargin ? 1 : 0)) return false // (MORE) needs a line
  const c = speechStart(w, index)
  let before = 0
  for (let i = c + 1; i <= index; i++) if (w.get(i).k === 'dialogue') before++
  const after = n + dialogueLinesAfter(w, index, on.e)
  if (before < p.minDialogueBefore || after < p.minDialogueAfter) return false
  return { index, prefix, more: true, character: c, rest, resume }
}

// ---------------------------------------------------------------------------------------------
// Page loop

export function contdText(name: string, p: Profile): string {
  if (p.rules === 'afterwriting') return name.trim() + ' ' + (name.indexOf(p.contd) !== -1 ? '' : p.contd)
  const n = name.trim()
  return n.toUpperCase().indexOf(p.contd.toUpperCase()) !== -1 ? n : n + ' ' + p.contd
}

export interface Ctx {
  stream: Line[]
  elements: Element[]
  p: Profile
}

function headOf(start: PageStart): Line[] {
  const h: Line[] = []
  if (start.carry) h.push(start.carry)
  if (start.rest) for (const l of start.rest) h.push(l)
  return h
}

/** Paginate one page from `start`. Returns the page and the next page's start (null at the end). */
export function nextPage(ctx: Ctx, start: PageStart): { page: Page; next: PageStart | null } | null {
  const { stream, p } = ctx
  let cursor = start.cursor
  const head = headOf(start)
  if (!head.length) {
    // leading lines without text are dropped at the top of a page
    while (cursor < stream.length && !(stream[cursor].t || stream[cursor].k === 'pad')) cursor++
    if (cursor >= stream.length) return null
  }
  const w = new Win(stream, cursor, head)
  // Final Draft prints the carried NAME (CONT'D) in the top margin, one row above the body
  const max = p.linesPerPage + (start.carry && p.contdInMargin ? 1 : 0)
  const pageStart: PageStart = { cursor, carry: start.carry, rest: start.rest }

  // forced page break: afterwriting takes the LAST one within the first max lines
  let internal = 0
  for (let i = 0; i < w.length && i < max; i++) {
    if (w.get(i).r === 'page_break') {
      internal = i
      if (p.rules === 'fd') break // fd: the first forced break wins
    }
  }

  let last: number
  let split: Split | null = null
  if (!internal) {
    if (w.length <= max) {
      const lines: Line[] = []
      for (let i = 0; i < w.length; i++) lines.push(w.get(i))
      return { page: { lines, start: pageStart }, next: null }
    }
    let d: Decision = false
    let pIdx: number
    if (p.rules === 'afterwriting') {
      let s = max
      do {
        pIdx = s - 1
        while (pIdx && !w.get(pIdx).t) pIdx--
        s = pIdx
      } while (pIdx && !(d = breakerAfterwriting(pIdx, w)))
      if (!pIdx) pIdx = max // afterwriting: no allowed break; the page gets max + 1 lines
    } else {
      for (pIdx = max - 1; pIdx > 0; pIdx--) {
        if (!hasText(w.get(pIdx))) continue
        d = breakerFd(pIdx, w, p, max, ctx.elements)
        if (d) break
      }
      if (pIdx <= 0) { pIdx = max - 1; d = true } // nothing allowed: cut at the bottom
    }
    if (d && d !== true) split = d
    last = pIdx
  } else {
    last = internal - 1
  }

  const lines: Line[] = []
  if (split) {
    for (let i = 0; i < split.index; i++) lines.push(w.get(i))
    const onBreak = w.get(split.index)
    if (split.index >= 0) lines.push(split.prefix !== null ? { ...onBreak, t: split.prefix } : onBreak)
    let carry: Line | null = null
    if (split.more) {
      const charLine = w.get(split.character)
      const more: Line = { t: p.more, k: 'more', r: 'dialogue', e: -1, li: -1, n: 0 }
      carry = { t: contdText(charLine.t, p), k: 'contd', r: 'dialogue', e: charLine.e, li: -1, n: 0 }
      if (onBreak.dual) more.dual = onBreak.dual
      if (charLine.dual) carry.dual = charLine.dual
      lines.push(more)
      if (charLine.right) {
        // afterwriting splits dual dialogue: the right column is cut at the same row
        const dlen = split.resume - split.character
        const rightThis = charLine.right.slice(0, dlen).concat([{ ...more }])
        const rightNext = [{ t: contdText(rightThis[0].t, p), k: 'contd', r: 'dialogue', e: rightThis[0].e, li: -1, n: 0, dual: 'right' } as Line].concat(charLine.right.slice(dlen))
        lines[split.character] = { ...charLine, right: rightThis }
        if (rightNext.length > 1) carry.right = rightNext
      }
    }
    const next: PageStart = { cursor: Math.max(w.abs(split.resume), cursor), carry, rest: split.rest.length ? split.rest : null }
    return { page: { lines, start: pageStart }, next }
  }
  for (let i = 0; i <= last && i < w.length; i++) lines.push(w.get(i))
  const resume = last + 1
  if (resume < head.length) {
    // (afterwriting cut at max + 1 inside a head; keep the rest of the head)
    return { page: { lines, start: pageStart }, next: { cursor, carry: null, rest: head.slice(resume) } }
  }
  const nextAbs = w.abs(resume)
  return { page: { lines, start: pageStart }, next: nextAbs < stream.length ? { cursor: nextAbs, carry: null, rest: null } : null }
}

export function paginate(elements: Element[], p: Profile): PaginateResult {
  const t0 = now()
  const { stream, elementStart } = buildStream(elements, p)
  const pages = pagesFrom({ stream, elements, p }, { cursor: 0, carry: null, rest: null })
  return { pages, stream, elementStart, ms: now() - t0 }
}

export function pagesFrom(ctx: Ctx, start: PageStart): Page[] {
  const pages: Page[] = []
  let s: PageStart | null = start
  while (s) {
    const r = nextPage(ctx, s)
    if (!r) break
    pages.push(r.page)
    s = r.next
  }
  return pages
}

export function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
