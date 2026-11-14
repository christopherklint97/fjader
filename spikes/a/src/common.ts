import { Plugin, PluginKey, type Command, type EditorState, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import type { Node as PMNode, Schema } from 'prosemirror-model'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark } from 'prosemirror-commands'
import { history, undo, redo } from 'prosemirror-history'
import type { Project, Scene } from '../../shared/fixture'

// ---- layout metrics (must match styles.css) --------------------------------
export const LINE = 28 // px, integer so remembered heights are whole pixels
export const PARA_GAP = 12
export const FONT = '17px Georgia, "Iowan Old Style", "Times New Roman", serif'
export const PAD_X = 16
export const MAX_WIDTH = 680
export const SCENE_PAD = 20 // top + bottom padding of a scene, each
export const CHAPTER_HEAD = 96 // h2 block incl. margins

export interface Layout {
  contentWidth: number
  charWidth: number
}

export function measureLayout(container: HTMLElement, sample: string): Layout {
  const width = Math.min(MAX_WIDTH, container.clientWidth) - 2 * PAD_X
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  let charWidth = 8
  if (ctx) {
    ctx.font = FONT
    const text = sample.slice(0, 4000)
    charWidth = ctx.measureText(text).width / Math.max(1, text.length)
  }
  return { contentWidth: Math.max(120, width), charWidth }
}

/** Height estimate for a scene that has never been rendered. */
export function estimateSceneHeight(scene: Scene, layout: Layout): number {
  const perLine = layout.contentWidth / layout.charWidth
  let height = 2 * SCENE_PAD
  for (const block of scene.blocks) {
    if (block.type === 'break') {
      height += LINE + PARA_GAP
      continue
    }
    let chars = 0
    for (const run of block.runs) chars += run.text.length
    const width = block.type === 'quote' ? perLine - 4 : perLine
    // Line breaking at word boundaries wastes a few percent of each line.
    const lines = Math.max(1, Math.ceil((chars * 1.035) / width))
    height += lines * LINE + PARA_GAP
  }
  return Math.round(height)
}

export function estimateChapterHeight(project: Project, chapter: number, layout: Layout): number {
  const c = project.chapters[chapter]
  let height = CHAPTER_HEAD
  for (let s = c.sceneStart; s < c.sceneStart + c.sceneCount; s++) height += estimateSceneHeight(project.scenes[s], layout)
  return height
}

// ---- shared editor plumbing -------------------------------------------------

export interface FindMark {
  from: number
  to: number
}

export const findKey = new PluginKey<FindMark | null>('find-current')

/** Highlights the current find match (the find box keeps the focus, so the
 *  native selection is not visible). */
export function findPlugin(): Plugin<FindMark | null> {
  return new Plugin<FindMark | null>({
    key: findKey,
    state: {
      init: () => null,
      apply(tr: Transaction, value: FindMark | null) {
        const meta = tr.getMeta(findKey)
        if (meta !== undefined) return meta as FindMark | null
        if (value && tr.docChanged) {
          const from = tr.mapping.map(value.from)
          const to = tr.mapping.map(value.to)
          return to > from ? { from, to } : null
        }
        return value
      },
    },
    props: {
      decorations(state: EditorState) {
        const mark = findKey.getState(state)
        if (!mark) return null
        return DecorationSet.create(state.doc, [Decoration.inline(mark.from, mark.to, { class: 'find-current' })])
      },
    },
  })
}

export function basePlugins(schema: Schema, extraKeys: Record<string, Command> = {}): Plugin[] {
  return [
    history(),
    keymap(extraKeys),
    keymap({
      'Mod-z': undo,
      'Shift-Mod-z': redo,
      'Mod-y': redo,
      'Mod-b': toggleMark(schema.marks.strong),
      'Mod-i': toggleMark(schema.marks.em),
    }),
    keymap(baseKeymap),
    findPlugin(),
  ]
}

/** Case-insensitive plain substring search inside one document. Matches never
 *  span blocks. Returns the start position of each match. */
export function findInDoc(doc: PMNode, needleLower: string, base = 0, out: number[] = []): number[] {
  if (!needleLower) return out
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textContent.toLowerCase()
    let idx = text.indexOf(needleLower)
    while (idx !== -1) {
      out.push(base + pos + 1 + idx)
      idx = text.indexOf(needleLower, idx + needleLower.length)
    }
    return false
  })
  return out
}

export function countInText(textLower: string, needleLower: string): number {
  if (!needleLower) return 0
  let count = 0
  let idx = textLower.indexOf(needleLower)
  while (idx !== -1) {
    count++
    idx = textLower.indexOf(needleLower, idx + needleLower.length)
  }
  return count
}

/** Scrolls so that the document position sits at `fraction` of the scroller height. */
export function scrollPosTo(view: EditorView, scroller: HTMLElement, pos: number, fraction: number): void {
  const coords = view.coordsAtPos(pos)
  const rect = scroller.getBoundingClientRect()
  scroller.scrollTop += coords.top - (rect.top + rect.height * fraction)
}

export interface FindResult {
  count: number
  ms: number
}

export interface Controller {
  readonly kind: 1 | 2 | 3
  readonly scroller: HTMLElement
  destroy(): void
  jumpToScene(index: number, offset?: number): void
  find(query: string): FindResult
  gotoMatch(n: number): void
  mountedCount(): number
  activeView(): EditorView | null
  toggleMark(name: 'em' | 'strong'): void
  selectAll(): void
  /** Text of the current selection, read from the model. */
  selectionText(): string
  projectText(): string
  sceneText(index: number): string
  blankPx(): number
  compensation(): number
  /** Scene and offset to save as "last position". */
  position(): { scene: number; offset: number }
  debug(): Record<string, unknown>
}
