// Minimal Final Draft (FDX) reader, only for loading reference scripts and their layout settings.
// Regex based; reads Paragraph Type + Text runs, DualDialogue groups, PageLayout and ElementSettings.

import type { Element, ElementStyle, ElementType, Profile } from '../paginator/types'
import { usFeature } from '../paginator/profiles'

const TYPE_MAP: Record<string, ElementType> = {
  'Scene Heading': 'scene_heading',
  Action: 'action',
  Character: 'character',
  Parenthetical: 'parenthetical',
  Dialogue: 'dialogue',
  Transition: 'transition',
  Shot: 'shot',
  General: 'action',
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&')

const attrs = (s: string) => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))

export function parseFdx(xml: string): Element[] {
  const content = xml
    .slice(xml.indexOf('<Content>'), xml.indexOf('</Content>'))
    // a DualDialogue sits inside a wrapper Paragraph: unwrap it
    .replace(/<Paragraph\b[^>]*>\s*<DualDialogue>/g, '<DualDialogue>')
    .replace(/<\/DualDialogue>\s*<\/Paragraph>/g, '</DualDialogue>')
  const out: Element[] = []
  // DualDialogue blocks contain Paragraphs; mark them
  const re = /<DualDialogue>|<\/DualDialogue>|<Paragraph\b([^>]*)>([\s\S]*?)<\/Paragraph>/g
  let inDual = false
  let dualSide: 'left' | 'right' = 'left'
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    if (m[0] === '<DualDialogue>') { inDual = true; dualSide = 'left'; continue }
    if (m[0] === '</DualDialogue>') { inDual = false; continue }
    const a = attrs(m[1])
    const type = TYPE_MAP[a.Type] ?? 'action'
    const text = [...m[2].matchAll(/<Text\b[^>]*>([\s\S]*?)<\/Text>|<Text\b[^>]*\/>/g)].map((t) => decode(t[1] ?? '')).join('')
    let t = text.replace(/\t/g, ' ')
    if (type === 'scene_heading' || type === 'character' || type === 'transition' || type === 'shot') t = t.toUpperCase()
    if (a.StartsNewPage === 'Yes' && out.length) out.push({ id: 'f' + out.length, type: 'page_break', text: '' })
    const el: Element = { id: 'f' + out.length, type, text: t }
    if (inDual && (type === 'character' || type === 'dialogue' || type === 'parenthetical')) {
      if (type === 'character' && out.some((o) => o.dual === 'left') && out[out.length - 1]?.dual === 'left') dualSide = 'right'
      el.dual = dualSide
    }
    out.push(el)
  }
  return out
}

export interface FdxLayout {
  topMargin: number
  bottomMargin: number
  breakAtSentences: boolean
  more: string
  contd: string
  styles: Record<string, { left: number; right: number; first: number; spaceBefore: number; align: string }>
}

export function readFdxLayout(xml: string): FdxLayout {
  const pl = attrs(xml.match(/<PageLayout\b([^>]*)>/)?.[1] ?? '')
  const styles: FdxLayout['styles'] = {}
  for (const m of xml.matchAll(/<ElementSettings Type="([^"]+)">\s*<FontSpec[^>]*\/>\s*<ParagraphSpec([^>]*)>/g)) {
    const a = attrs(m[2])
    styles[m[1]] = { left: +a.LeftIndent, right: +a.RightIndent, first: +(a.FirstIndent ?? 0), spaceBefore: +(a.SpaceBefore ?? 0) / 12, align: a.Alignment }
  }
  const db = attrs(xml.match(/<DialogueBreaks\b([^>]*)\/>/)?.[1] ?? '')
  return {
    topMargin: +(pl.TopMargin ?? 72) / 72,
    bottomMargin: +(pl.BottomMargin ?? 72) / 72,
    breakAtSentences: pl.BreakDialogueAndActionAtSentences === 'Yes',
    more: db.DialogueBottom || '(MORE)',
    contd: db.DialogueTop || "(CONT'D)",
    styles,
  }
}

/** Build a profile from a Final Draft file's own settings (fd rules). */
export function profileFromFdx(xml: string, name: string, overrides: Partial<Profile> = {}, pitchPt = 7.2): Profile {
  const L = readFdxLayout(xml)
  const cw = pitchPt / 72
  const style = (fdName: string, fallback: ElementStyle): ElementStyle => {
    const s = L.styles[fdName]
    if (!s) return fallback
    const width = Math.floor((s.right - s.left) / cw + 1e-6)
    const st: ElementStyle = { indent: s.left, width, spaceBefore: Math.round(s.spaceBefore) }
    if (s.first) st.firstIndent = s.first
    if (s.align === 'Right') st.align = 'right'
    if (s.align === 'Center') st.align = 'center'
    return st
  }
  const base = usFeature.elements
  const body = 11 - L.topMargin - L.bottomMargin
  return {
    ...usFeature,
    name,
    topMargin: L.topMargin,
    linesPerPage: Math.floor(body * 6 + 1e-6),
    charWidth: cw,
    pageNumberRight: (L.styles.Action?.right ?? 7.5),
    elements: {
      scene_heading: style('Scene Heading', base.scene_heading),
      action: style('Action', base.action),
      shot: style('Shot', base.shot),
      character: style('Character', base.character),
      parenthetical: style('Parenthetical', base.parenthetical),
      dialogue: style('Dialogue', base.dialogue),
      transition: style('Transition', base.transition),
      centered: { ...style('Action', base.action), align: 'center' },
    },
    more: L.more,
    contd: L.contd,
    breakAtSentences: L.breakAtSentences,
    // Final Draft 8 behaviour seen in its PDFs
    contdInMargin: true,
    moreInMargin: true,
    parentheticalBeforeMore: true,
    ...overrides,
  }
}
