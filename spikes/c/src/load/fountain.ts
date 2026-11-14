// Fountain loader, only for loading test scripts (Fountain is not the app's model).
//
// Ported by hand from aw-parser 0.1.1 (npm package "aw-parser", parser.js), the parser
// afterwriting 1.17.3 uses. Original: Copyright (c) 2017 aw-parser. MIT License:
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
// Settings fixed to afterwriting's defaults: notes, sections and synopses not printed, multiple
// empty lines merged, dual dialogue on, no extra space between scenes, scenes not on new pages.
// Output: one element per afterwriting token (one per source line), blankBefore = blank lines
// before it after merging. `toElementModel` then merges source lines into editor-style elements.

import type { Element, ElementType } from '../paginator/types'

const regex = {
  title_page: /(title|credit|author[s]?|source|notes|draft date|date|contact|copyright)\:.*/i,
  section: /^(#+)(?: *)(.*)/,
  synopsis: /^(?:\=(?!\=+) *)(.*)/,
  scene_heading: /^((?:\*{0,3}_?)?(?:(?:int|ext|est|int\/ext|i\.?\/e\.?)[. ]).+)|^(?:\.(?!\.+))(.+)/i,
  scene_number: /#(.+)#/,
  transition: /^((?:FADE (?:TO BLACK|OUT)|CUT TO BLACK)\.|.+ TO\:|^TO\:$)|^(?:> *)(.+)/,
  parenthetical: /^(\(.+\))$/,
  centered: /^(?:> *)(.+)(?: *<)(\n.+)*/,
  page_break: /^\={3,}$/,
  line_break: /^ {2}$/,
}

interface Tok {
  type: string
  text: string
  dual?: 'left' | 'right'
}

export function parseFountain(script: string): Element[] {
  const tokens: Tok[] = []
  if (!script) return []
  // notes are not printed: [[ ]] become comments
  script = script.replace(/ {0,1}\[\[/g, ' /*').replace(/\]\] {0,1}/g, '*/')
  const lines = script.split(/\r\n|\r|\n/)
  let lastWasSeparator = false
  let state = 'normal'
  let cacheState = 'normal'
  let nested = 0
  let titlePageStarted = false
  let lastCharacterIndex = -1
  let dualRight = false

  for (let i = 0; i < lines.length; i++) {
    let text = lines[i]
    // inline comments
    text = (text.split(/(\/\*){1}|(\*\/){1}|([^\/\*]+)/g).filter((a) => a) as string[]).reduce((prev, cur) => {
      if (cur === '/*') nested++
      else if (cur === '*/') nested--
      else if (!nested) prev = prev + cur
      return prev
    }, '')
    if (nested && state !== 'ignore') {
      cacheState = state
      state = 'ignore'
    } else if (state === 'ignore') {
      state = cacheState
    }
    if (nested === 0 && state === 'ignore') state = cacheState

    const token: Tok = { type: '', text }

    if (text.trim().length === 0 && text !== '  ') {
      const skip = lastWasSeparator // merge_multiple_empty_lines
      state = 'normal'
      if (skip) continue
      dualRight = false
      token.type = 'separator'
      lastWasSeparator = true
      tokens.push(token)
      continue
    }

    const topOrSeparated = lastWasSeparator || i === 0
    let category = 'script'

    if (!titlePageStarted && regex.title_page.test(token.text)) state = 'title_page'
    if (state === 'title_page') {
      if (regex.title_page.test(token.text)) {
        titlePageStarted = true
        continue
      } else if (titlePageStarted) {
        continue
      }
    }

    let m: RegExpMatchArray | null
    if (state === 'normal') {
      if (token.text.match(regex.line_break)) {
        category = 'none'
      } else if (token.text.match(regex.scene_heading)) {
        token.text = token.text.replace(/^\./, '')
        token.type = 'scene_heading'
        if (token.text.match(regex.scene_number)) token.text = token.text.replace(regex.scene_number, '')
      } else if (token.text.match(regex.centered)) {
        token.type = 'centered'
        token.text = token.text.replace(/>|</g, '').trim()
      } else if (token.text.match(regex.transition)) {
        token.text = token.text.replace(/> ?/, '')
        token.type = 'transition'
      } else if ((m = token.text.match(regex.synopsis))) {
        token.text = m[1]
        token.type = token.text ? 'synopsis' : 'separator'
      } else if ((m = token.text.match(regex.section))) {
        token.text = m[2]
        token.type = 'section'
      } else if (token.text.match(regex.page_break)) {
        token.text = ''
        token.type = 'page_break'
      } else if (token.text.length && token.text[0] === '!') {
        token.type = 'action'
        token.text = token.text.substr(1)
      } else if ((token.text.length > 0 && token.text[0] === '@') || (token.text === token.text.toUpperCase() && topOrSeparated)) {
        if (i === lines.length - 1 || lines[i + 1].trim().length === 0) {
          token.type = 'shot'
        } else {
          state = 'dialogue'
          token.type = 'character'
          token.text = token.text.replace(/^@/, '')
          if (token.text[token.text.length - 1] === '^') {
            // update last dialogue to be dual: left
            let k = lastCharacterIndex
            while (k >= 0 && k < tokens.length && ['dialogue', 'character', 'parenthetical'].includes(tokens[k].type)) {
              tokens[k].dual = 'left'
              k++
            }
            token.dual = 'right'
            dualRight = true
            token.text = token.text.replace('^', '')
          }
          lastCharacterIndex = tokens.length
        }
      } else {
        token.type = 'action'
      }
    } else {
      token.type = token.text.match(regex.parenthetical) ? 'parenthetical' : 'dialogue'
      if (dualRight) token.dual = 'right'
    }

    lastWasSeparator = false

    if (category === 'script' && state !== 'ignore') {
      if (token.type === 'scene_heading' || token.type === 'transition') {
        token.text = token.text.toUpperCase()
        titlePageStarted = true
      }
      if (token.text && token.text[0] === '~') token.text = '*' + token.text.substr(1) + '*'
      token.text = token.type === 'action' ? token.text : token.text.trim()
      tokens.push(token)
    }
  }

  // tidy up: drop unprinted tokens, merge empty lines
  const out: Tok[] = []
  let prevType: string | null = null
  for (const t of tokens) {
    if (t.type === 'note' || t.type === 'section' || t.type === 'synopsis') continue
    if (t.type === 'separator' && prevType === 'separator') continue
    out.push(t)
    prevType = t.type
  }
  while (out.length && out[out.length - 1].type === 'separator') out.pop()

  const elements: Element[] = []
  let blanks = 0
  for (const t of out) {
    if (t.type === 'separator') { blanks++; continue }
    const el: Element = { id: 'e' + elements.length, type: t.type as ElementType, text: t.text, blankBefore: blanks }
    if (t.dual) el.dual = t.dual
    elements.push(el)
    blanks = 0
  }
  return elements
}

/** Strip Fountain emphasis markers (* and _), as the editor model keeps marks out of the text. */
export function stripEmphasis(s: string): string {
  return s.replace(/\\\*/g, '\u0001').replace(/\\_/g, '\u0002').replace(/\*/g, '').replace(/_/g, '').replace(/\u0001/g, '*').replace(/\u0002/g, '_')
}

/**
 * Editor-style elements: consecutive source lines of one action paragraph or one speech become one
 * element with hard line breaks; emphasis markers are removed; blankBefore is dropped so the
 * profile's spacing applies.
 */
export function toElementModel(tokens: Element[]): Element[] {
  const out: Element[] = []
  for (const t of tokens) {
    const prev = out[out.length - 1]
    const text = stripEmphasis(t.text)
    if (prev && t.blankBefore === 0 && ((prev.type === 'action' && t.type === 'action') || (prev.type === 'dialogue' && t.type === 'dialogue' && prev.dual === t.dual))) {
      prev.text += '\n' + text
      continue
    }
    const el: Element = { id: 'm' + out.length, type: t.type, text }
    if (t.dual) el.dual = t.dual
    out.push(el)
  }
  return out
}
