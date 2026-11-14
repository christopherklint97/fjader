import { describe, expect, test } from 'bun:test'
import { paginate } from '../src/paginator/paginate'
import { usFeature, afterwritingUsLetter } from '../src/paginator/profiles'
import { wrapText, wrapWithOffsets } from '../src/paginator/wrap'
import { parseFountain, toElementModel } from '../src/load/fountain'
import { generateStress } from '../src/fixtures/stress'
import { LivePaginator } from '../src/paginator/incremental'
import { pageRows } from '../src/paginator/layout'
import { E, filler, checkInvariants, lastContent, firstContent, pagesSignature } from './helpers'

const P = usFeature

describe('wrap', () => {
  test('afterwriting: breaks at the last space within max+1, no hyphen breaks', () => {
    expect(wrapText('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc'])
    expect(wrapText('well-lit room', 6)).toEqual(['well-', 'lit', 'room']) // (cut at max - 1, not at the hyphen)
    expect(wrapText('abcdefghij', 5)).toEqual(['abcd', 'efgh', 'ij']) // no space: cut at max - 1
  })
  test('fd: break after a hyphen, hanging dash, offsets', () => {
    expect(wrapText('more hundred-dollar lures', 14, { breakHyphens: true })).toEqual(['more hundred-', 'dollar lures'])
    expect(wrapText('with his father-- and more', 16, { breakHyphens: true })).toEqual(['with his father--', 'and more'])
    const w = wrapWithOffsets('one two three four', 8, {})
    expect(w.lines).toEqual(['one two', 'three', 'four'])
    expect(w.starts).toEqual([0, 8, 14])
    expect(wrapText('ends here.  ', 10, { breakHyphens: true })).toEqual(['ends here.'])
  })
  test('hanging dash: a "--" one column past the width stays on the line', () => {
    const t = 'x'.repeat(8) + '--' + ' next'
    expect(wrapText(t, 9, { breakHyphens: true })[0]).toBe('x'.repeat(8) + '--')
  })
})

describe('break rules (us-feature profile, fd rules)', () => {
  test('a scene heading is never the last line of a page', () => {
    // filler fills rows 0-50, blank 51, heading 52, blank 53: the action after it cannot follow
    const els = [filler(51), E('scene_heading', 'INT. HOUSE - DAY'), E('action', 'Something happens.')]
    const r = paginate(els, P)
    expect(r.pages.length).toBe(2)
    expect(lastContent(r.pages[0])!.k).toBe('action')
    expect(firstContent(r.pages[1])!.k).toBe('scene_heading')
  })
  test('a lone line of dialogue moves to the next page with its name', () => {
    // rows 0-50 filler, blank 51, NAME 52, one line 53, (MORE) 54: only one dialogue line would stay
    const els = [filler(51), E('character', 'ANNA'), E('dialogue', 'One. Two three four five six seven eight. Nine ten eleven twelve thirteen. Fourteen fifteen sixteen.')]
    const r = paginate(els, P)
    expect(lastContent(r.pages[0])!.k).toBe('action')
    expect(firstContent(r.pages[1])!.t).toBe('ANNA')
  })
  test('split speech gets (MORE) and NAME (CONT\'D), at a sentence end', () => {
    const speech = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here.`).join(' ')
    const els = [filler(46), E('character', 'BEN'), E('dialogue', speech)]
    const r = paginate(els, P)
    expect(r.pages.length).toBe(2)
    const p1 = r.pages[0].lines
    expect(p1[p1.length - 1].k).toBe('more')
    expect(p1[p1.length - 2].t).toMatch(/\.$/)
    expect(r.pages[1].lines[0].t).toBe("BEN (CONT'D)")
    expect(checkInvariants(r, els, P)).toEqual([])
  })
  test('a parenthetical is not left as the last line before a break', () => {
    const els = [filler(48), E('character', 'CLARA'), E('dialogue', 'Line one is here. Line two is here.'), E('parenthetical', '(beat)'), E('dialogue', 'And then a long speech follows here. ' + 'More words in a sentence. '.repeat(8))]
    const r = paginate(els, P)
    const bad = checkInvariants(r, els, P)
    expect(bad).toEqual([])
    for (const pg of r.pages.slice(0, -1)) expect(lastContent(pg)!.k).not.toBe('parenthetical')
  })
  test('dual dialogue stays side by side, as tall as the taller column', () => {
    const els = [filler(50), E('character', 'ANNA', 'left'), E('dialogue', 'Short.', 'left'), E('character', 'BEN', 'right'), E('dialogue', 'A much longer reply that runs over several lines of the narrow column. And more.', 'right')]
    const r = paginate(els, P)
    expect(r.pages.length).toBe(2) // block of 5 rows from row 51 does not fit in rows 0-53
    const rows = pageRows(r.pages[1], P)
    expect(rows[0].text).toContain('ANNA')
    expect(rows[0].text).toContain('BEN')
    expect(checkInvariants(r, els, P)).toEqual([])
  })
  test('action splits only at a sentence end, two lines each side', () => {
    const para = Array.from({ length: 10 }, (_, i) => `The ${i}th sentence of the long action paragraph ends here.`).join(' ')
    const els = [filler(44), E('action', para)]
    const r = paginate(els, P)
    expect(checkInvariants(r, els, P)).toEqual([])
    expect(lastContent(r.pages[0])!.t).toMatch(/here\.$/)
  })
})

describe('invariants on generated scripts', () => {
  for (const pages of [120, 500]) {
    test(`stress-${pages}`, () => {
      const els = toElementModel(parseFountain(generateStress(pages, 7)))
      const r = paginate(els, P)
      const bad = checkInvariants(r, els, P)
      expect(bad.slice(0, 10)).toEqual([])
    })
  }
})

describe('incremental equals full pagination', () => {
  for (const [name, prof, model] of [['us-feature', P, true], ['afterwriting', afterwritingUsLetter, false]] as const) {
    test(`random edits, ${name}`, () => {
      const base = parseFountain(generateStress(120, 11))
      const els = model ? toElementModel(base) : base
      const live = new LivePaginator(els, prof)
      let seed = 3
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
      let resynced = 0
      for (let i = 0; i < 150; i++) {
        const idx = Math.floor(rnd() * live.elements.length)
        const el = live.elements[idx]
        if (el.type === 'page_break') continue
        const r = rnd()
        const text = r < 0.4 ? el.text + ' added words here.' : r < 0.7 ? el.text.slice(0, Math.max(1, Math.floor(el.text.length / 2))) : el.text + ' x'.repeat(Math.floor(rnd() * 80))
        const st = live.editText(idx, text)
        if (st.resynced) resynced++
        const full = paginate(live.elements, prof)
        expect(pagesSignature(live.res)).toEqual(pagesSignature(full))
      }
      expect(resynced).toBeGreaterThan(50)
    })
  }
})
