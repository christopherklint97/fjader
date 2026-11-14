import { EditorState, TextSelection, AllSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { toggleMark } from 'prosemirror-commands'
import type { Project } from '../../shared/fixture'
import { buildProjectDoc, projectSchema } from './schema'
import {
  basePlugins,
  estimateChapterHeight,
  findInDoc,
  findKey,
  scrollPosTo,
  type Controller,
  type FindResult,
  type Layout,
} from './common'

/** Variants 1 and 2: the whole project in one ProseMirror instance.
 *  Variant 2 adds `content-visibility: auto` per chapter (CSS class on the host). */
export class SingleEditor implements Controller {
  readonly view: EditorView
  private matches: number[] = []
  private needleLength = 0
  private repairSelection = new URLSearchParams(location.search).get('v2fix') !== '0'
  timings: Record<string, number> = {}

  constructor(
    readonly kind: 1 | 2,
    private host: HTMLElement,
    readonly scroller: HTMLElement,
    private project: Project,
    layout: Layout,
  ) {
    host.classList.toggle('cv', kind === 2)
    let t = performance.now()
    const doc = buildProjectDoc(project, (chapter) => estimateChapterHeight(project, chapter, layout))
    this.timings.buildDoc = performance.now() - t
    t = performance.now()
    this.view = new EditorView(host, {
      state: EditorState.create({ doc, plugins: basePlugins(projectSchema) }),
    })
    this.timings.createView = performance.now() - t
  }

  destroy(): void {
    this.view.destroy()
    this.host.classList.remove('cv')
  }

  /** Position just before the scene node. Walks the chapters (cheap: ~750 nodes). */
  private scenePos(index: number): { pos: number; size: number } | null {
    const doc = this.view.state.doc
    let found: { pos: number; size: number } | null = null
    doc.forEach((chapter, chapterPos) => {
      if (found) return
      chapter.forEach((child, offset) => {
        if (!found && child.type.name === 'scene' && child.attrs.index === index) {
          found = { pos: chapterPos + 1 + offset, size: child.nodeSize }
        }
      })
    })
    return found
  }

  jumpToScene(index: number, offset = 0): void {
    const at = this.scenePos(index)
    if (!at) return
    const view = this.view
    const inside = Math.min(at.pos + 1 + offset, at.pos + at.size - 1)
    const selection = TextSelection.near(view.state.doc.resolve(inside), 1)
    view.dispatch(view.state.tr.setSelection(selection))
    if (offset === 0) {
      const dom = view.nodeDOM(at.pos) as HTMLElement | null
      if (dom) this.scroller.scrollTop += dom.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top
    } else {
      scrollPosTo(view, this.scroller, selection.head, 0.35)
    }
    view.focus()
    if (this.kind === 2) {
      const head = selection.head
      this.settle(() => {
        if (offset === 0) {
          const now = this.scenePos(index)
          const dom = now ? (view.nodeDOM(now.pos) as HTMLElement | null) : null
          return dom ? dom.getBoundingClientRect().top : null
        }
        return head <= view.state.doc.content.size ? view.coordsAtPos(head).top : null
      }, offset === 0 ? 0 : 0.35)
    }
  }

  /** Variant 2 only, after any programmatic selection into a chapter that may
   *  have been skipped:
   *  1. Chapters near the target switch from their size hint to their real
   *     size. Browsers without scroll anchoring then move the target, so
   *     re-check its position for two frames.
   *  2. WebKit resolves a selection set inside skipped content to the nearest
   *     rendered position (the start of the next chapter) and keeps using that
   *     for typing, although getSelection() still reports the caret we set.
   *     Typed text then lands in the wrong chapter. Setting the same selection
   *     again once the chapter is rendered repairs it. `?v2fix=0` turns the
   *     repair off to show the raw behaviour. */
  private settle(target: () => number | null, fraction: number): void {
    let frames = 0
    const check = () => {
      if (this.view.isDestroyed) return
      const top = target()
      if (top !== null) {
        const rect = this.scroller.getBoundingClientRect()
        const delta = top - (rect.top + rect.height * fraction)
        if (Math.abs(delta) > 1) this.scroller.scrollTop += delta
      }
      if (this.repairSelection) {
        const selection = document.getSelection()
        if (selection && selection.anchorNode && this.view.dom.contains(selection.anchorNode)) {
          selection.setBaseAndExtent(selection.anchorNode, selection.anchorOffset, selection.focusNode!, selection.focusOffset)
        }
      }
      if (++frames < 2) requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }

  find(query: string): FindResult {
    const start = performance.now()
    const needle = query.toLowerCase()
    this.needleLength = needle.length
    this.matches = findInDoc(this.view.state.doc, needle)
    if (!needle) this.view.dispatch(this.view.state.tr.setMeta(findKey, null))
    return { count: this.matches.length, ms: performance.now() - start }
  }

  gotoMatch(n: number): void {
    if (this.matches.length === 0) return
    const from = this.matches[((n % this.matches.length) + this.matches.length) % this.matches.length]
    const to = Math.min(from + this.needleLength, this.view.state.doc.content.size)
    const view = this.view
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)).setMeta(findKey, { from, to }),
    )
    scrollPosTo(view, this.scroller, from, 0.35)
    if (this.kind === 2) this.settle(() => (from <= view.state.doc.content.size ? view.coordsAtPos(from).top : null), 0.35)
  }

  mountedCount(): number {
    return 1
  }

  activeView(): EditorView {
    return this.view
  }

  toggleMark(name: 'em' | 'strong'): void {
    toggleMark(projectSchema.marks[name])(this.view.state, this.view.dispatch)
    this.view.focus()
  }

  selectAll(): void {
    this.view.dispatch(this.view.state.tr.setSelection(new AllSelection(this.view.state.doc)))
    this.view.focus()
  }

  selectionText(): string {
    const { from, to } = this.view.state.selection
    return this.view.state.doc.textBetween(from, to, '\n\n')
  }

  projectText(): string {
    const doc = this.view.state.doc
    return doc.textBetween(0, doc.content.size, '\n\n')
  }

  sceneText(index: number): string {
    const at = this.scenePos(index)
    if (!at) return ''
    return this.view.state.doc.textBetween(at.pos + 1, at.pos + at.size - 1, '\n\n')
  }

  blankPx(): number {
    return 0
  }

  compensation(): number {
    return 0
  }

  position(): { scene: number; offset: number } {
    const { $head } = this.view.state.selection
    for (let depth = $head.depth; depth > 0; depth--) {
      const node = $head.node(depth)
      if (node.type.name === 'scene') return { scene: node.attrs.index, offset: $head.pos - $head.start(depth) }
    }
    return { scene: 0, offset: 0 }
  }

  debug(): Record<string, unknown> {
    return { ...this.timings, docSize: this.view.state.doc.content.size, chapters: this.project.chapters.length }
  }
}
