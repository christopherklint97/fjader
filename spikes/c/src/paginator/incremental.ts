// Incremental pagination: after a text edit, re-run from the page before the edited block and stop
// as soon as a page starts where an old page started (shifted by the edit's change in line count).
// From there on the old pages are reused. New code for this spike.

import { buildStream, nextPage, now, paginate, type Ctx } from './paginate'
import type { Element, Line, Page, PageStart, PaginateResult, Profile } from './types'

export interface EditStats {
  ms: number
  full: boolean
  /** Page index the re-run started from. */
  fromPage: number
  /** Pages computed by the re-run. */
  recomputed: number
  /** True if the re-run met the old pages again before the end. */
  resynced: boolean
  pages: number
}

const sameHead = (a: PageStart, b: PageStart) => {
  if ((a.carry?.t ?? '') !== (b.carry?.t ?? '')) return false
  if ((a.carry?.right?.length ?? 0) !== (b.carry?.right?.length ?? 0)) return false
  const ra = a.rest ?? []
  const rb = b.rest ?? []
  if (ra.length !== rb.length) return false
  for (let i = 0; i < ra.length; i++) if (ra[i].t !== rb[i].t || ra[i].e !== rb[i].e) return false
  return true
}

export class LivePaginator {
  elements: Element[]
  p: Profile
  res: PaginateResult

  constructor(elements: Element[], p: Profile) {
    this.elements = elements.slice()
    this.p = p
    this.res = paginate(this.elements, p)
  }

  /** Replace all elements and paginate from scratch. */
  reset(elements: Element[]): EditStats {
    const t0 = now()
    this.elements = elements.slice()
    this.res = paginate(this.elements, this.p)
    return { ms: now() - t0, full: true, fromPage: 0, recomputed: this.res.pages.length, resynced: false, pages: this.res.pages.length }
  }

  /** Change the text of element `index`. */
  editText(index: number, text: string): EditStats {
    const t0 = now()
    const p = this.p
    const old = this.res
    const el = this.elements[index]
    this.elements[index] = { ...el, text }
    const { stream, elementStart } = buildStream(this.elements, p)
    const ctx: Ctx = { stream, elements: this.elements, p }

    // the edited block: a whole speech or dual-dialogue block, since break rules look across it
    let c0 = index
    while (c0 > 0 && (this.elements[c0].dual || this.elements[c0].type === 'dialogue' || this.elements[c0].type === 'parenthetical')) c0--
    let c1 = index
    while (c1 + 1 < this.elements.length && (this.elements[c1 + 1].dual || this.elements[c1 + 1].type === 'dialogue' || this.elements[c1 + 1].type === 'parenthetical')) c1++

    // last text line before the block, in the old stream (identical to the new one up to there)
    let s = old.elementStart[c0] - 1
    while (s > 0 && !old.stream[s].t) s--
    // the page containing it, minus one for look-ahead across page starts
    let k = 0
    let lo = 0
    let hi = old.pages.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (old.pages[mid].start.cursor <= Math.max(s, 0)) { k = mid; lo = mid + 1 } else hi = mid - 1
    }
    k = Math.max(0, k - 1)

    const delta = elementStart[c1 + 1] - old.elementStart[c1 + 1]
    const blockEnd = elementStart[c1 + 1]
    const oldByCursor = new Map<number, number>()
    for (let m = k + 1; m < old.pages.length; m++) {
      if (old.pages[m].start.cursor + delta >= blockEnd) oldByCursor.set(old.pages[m].start.cursor + delta, m)
    }

    const pages: Page[] = old.pages.slice(0, k)
    let start: PageStart | null = k === 0 ? { cursor: 0, carry: null, rest: null } : old.pages[k].start
    let recomputed = 0
    let resynced = false
    while (start) {
      const r = nextPage(ctx, start)
      if (!r) break
      pages.push(r.page)
      recomputed++
      start = r.next
      if (start && start.cursor >= blockEnd) {
        const m = oldByCursor.get(start.cursor)
        if (m !== undefined && sameHead(old.pages[m].start, start)) {
          // reuse the old pages from m on, with their stream positions shifted
          for (let q = m; q < old.pages.length; q++) {
            const op = old.pages[q]
            pages.push(delta ? { lines: op.lines, start: { ...op.start, cursor: op.start.cursor + delta } } : op)
          }
          resynced = true
          break
        }
      }
    }
    this.res = { pages, stream, elementStart, ms: now() - t0 }
    return { ms: now() - t0, full: false, fromPage: k, recomputed, resynced, pages: pages.length }
  }
}

/** Page index (0-based) holding the first line of element `e`. */
export function pageOfElement(res: PaginateResult, e: number): number {
  for (let i = 0; i < res.pages.length; i++) {
    const nextCursor = i + 1 < res.pages.length ? res.pages[i + 1].start.cursor : Infinity
    if (res.elementStart[e] < nextCursor) return i
  }
  return res.pages.length - 1
}

export type { Line }
