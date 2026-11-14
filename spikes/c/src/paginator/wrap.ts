// Fixed-pitch line wrapping.
//
// Ported by hand from afterwriting's liner `split_text`
// (https://github.com/ifrost/afterwriting-labs, js/utils/liner.js, commit f1912c08d0905bac42e1805830a1e72f98b88c2f).
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
// Changes: iterative instead of recursive; returns each line's start offset in the text; optional
// wider first line (hanging indent, Final Draft's parenthetical); optional Final Draft behaviour
// (break after a hyphen, a hyphen or dash may hang one column into the margin); hard line breaks
// ("\n") in the element text are honoured (each segment is wrapped on its own).

export interface WrapOptions {
  /** Width of the first line if different (hanging indent). */
  firstWidth?: number
  /** Final Draft behaviour: break after a hyphen; a trailing hyphen or dash may hang one column. */
  breakHyphens?: boolean
}

export interface Wrapped {
  lines: string[]
  /** Offset in the text of each line's first character. */
  starts: number[]
}

export function wrapText(text: string, width: number, opts: WrapOptions = {}): string[] {
  return wrapWithOffsets(text, width, opts).lines
}

export function wrapWithOffsets(text: string, width: number, opts: WrapOptions = {}): Wrapped {
  const out: Wrapped = { lines: [], starts: [] }
  if (text.indexOf('\n') !== -1) {
    const parts = text.split('\n')
    let off = 0
    for (let i = 0; i < parts.length; i++) {
      wrapSegment(parts[i], off, width, i === 0 ? opts.firstWidth : undefined, !!opts.breakHyphens, out)
      off += parts[i].length + 1
    }
    return out
  }
  wrapSegment(text, 0, width, opts.firstWidth, !!opts.breakHyphens, out)
  return out
}

function wrapSegment(text: string, base: number, width: number, firstWidth: number | undefined, fd: boolean, out: Wrapped) {
  let rest = text
  const first = out.lines.length
  let pos = base // offset of rest[0] in the full text
  let max = Math.floor(firstWidth ?? width)
  const w = Math.floor(width)
  const push = (s: string) => {
    out.lines.push(s)
    out.starts.push(pos)
  }
  while (rest.length > max) {
    if (fd && rest[max] === '-' && rest[max - 1] !== ' ' && rest[max + 1] !== '-') {
      // a hyphen or dash may hang one column into the right margin (Final Draft's PDFs end lines
      // of max + 1 characters with "half-" and "--")
      push(rest.substring(0, max + 1))
      const adv = rest[max + 1] === ' ' ? max + 2 : max + 1
      rest = rest.substring(adv)
      pos += adv
      max = w
      if (!rest) return
      continue
    }
    // afterwriting: last space within the first max+1 characters
    let pointer = rest.substring(0, max + 1).lastIndexOf(' ')
    let skip = 1
    if (fd) {
      // a hyphen inside a word lets the line end just after it
      const h = rest.substring(0, max).lastIndexOf('-')
      if (h > 0 && h + 1 > pointer && rest[h - 1] !== ' ' && rest[h + 1] !== ' ' && rest[h + 1] !== '-' && rest[h - 1] !== '-') {
        pointer = h + 1
        skip = 0
      }
    }
    if (pointer === -1) {
      // no break point: afterwriting cuts at max - 1 characters
      pointer = Math.max(1, max - 1) // guard: afterwriting would loop forever at max <= 1
      skip = 0
    }
    push(rest.substring(0, pointer))
    rest = rest.substring(pointer + skip)
    pos += pointer + skip
    if (fd) {
      // a line never starts with a space (two spaces after a full stop)
      const lead = rest.length - rest.replace(/^ +/, '').length
      rest = rest.substring(lead)
      pos += lead
    }
    max = w
  }
  // fd: trailing spaces never make a line of their own
  if (fd && !rest.trim() && out.lines.length > first) return
  push(rest)
}
