import { EditorState, Plugin, PluginKey, Selection, TextSelection, type Command, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'
import { toggleMark } from 'prosemirror-commands'
import type { Project, Scene } from '../../shared/fixture'
import { buildSceneDoc, sceneSchema } from './schema'
import {
  LINE,
  PARA_GAP,
  SCENE_PAD,
  basePlugins,
  countInText,
  estimateSceneHeight,
  findInDoc,
  findKey,
  scrollPosTo,
  type Controller,
  type FindResult,
  type Layout,
} from './common'

interface SceneModel {
  scene: Scene
  /** Latest document; built lazily from the fixture on first use. */
  doc: PMNode | null
  /** Editor state kept across unmounts (selection and undo history). */
  state: EditorState | null
  textLower: string | null
}

interface Point {
  scene: number
  pos: number
}

interface CrossSelection {
  anchor: Point
  head: Point
  goalX: number | null
}

type CrossRange = { from: number; to: number } | 'full' | null

const crossKey = new PluginKey<CrossRange>('cross-selection')

/** Draws the part of a cross-scene selection that falls inside one scene. */
function crossPlugin(): Plugin<CrossRange> {
  return new Plugin<CrossRange>({
    key: crossKey,
    state: {
      init: () => null,
      apply(tr: Transaction, value: CrossRange) {
        const meta = tr.getMeta(crossKey)
        if (meta !== undefined) return meta as CrossRange
        return tr.docChanged ? null : value
      },
    },
    props: {
      decorations(state: EditorState) {
        const range = crossKey.getState(state)
        if (!range) return null
        if (range === 'full') {
          // Whole scene selected: one class per block is far cheaper than
          // wrapping every text node.
          const decos: Decoration[] = []
          state.doc.forEach((node, pos) => decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'xsel-block' })))
          return DecorationSet.create(state.doc, decos)
        }
        if (range.to <= range.from) return null
        return DecorationSet.create(state.doc, [Decoration.inline(range.from, range.to, { class: 'xsel' })])
      },
    },
  })
}

function fixtureText(scene: Scene, separator: string): string {
  const parts: string[] = []
  for (const block of scene.blocks) {
    if (block.type === 'break') continue
    let text = ''
    for (const run of block.runs) text += run.text
    parts.push(text)
  }
  return parts.join(separator)
}

function estimateDocHeight(doc: PMNode, layout: Layout): number {
  const perLine = layout.contentWidth / layout.charWidth
  let height = 2 * SCENE_PAD
  doc.forEach((node) => {
    if (node.type.name === 'scene_break') height += LINE + PARA_GAP
    else height += Math.max(1, Math.ceil((node.textContent.length * 1.035) / perLine)) * LINE + PARA_GAP
  })
  return Math.round(height)
}

export interface WindowedOptions {
  /** Screens of content kept mounted above and below the viewport. */
  overscan?: number
  /** true: correct scrollTop ourselves when heights change above the viewport.
   *  false: leave it to the browser's scroll anchoring (overflow-anchor). */
  manualAnchor?: boolean
}

/** Variant 3: one ProseMirror instance per scene; only scenes near the viewport
 *  are mounted, the rest are placeholders with remembered heights. */
export class Windowed implements Controller {
  readonly kind = 3 as const
  readonly models: SceneModel[]
  readonly slots: HTMLElement[] = []
  readonly views = new Map<number, EditorView>()
  private viewIndex = new WeakMap<EditorView, number>()
  private plugins: Plugin[]
  private focused: number | null = null
  private cross: CrossSelection | null = null
  private dragFrom: number | null = null
  private comp = 0
  private overscan: number
  readonly manualAnchor: boolean
  private frameRequest = 0
  private resizeObserver: ResizeObserver
  private lastWidth = 0
  private matchCounts: number[] = []
  private matchTotal = 0
  private needle = ''
  private findScene = -1
  stats = { mounts: 0, unmounts: 0, mountMs: 0, maxMountMs: 0, lastMountMs: 0, compensations: 0, maxCompPx: 0 }

  constructor(
    private host: HTMLElement,
    readonly scroller: HTMLElement,
    private project: Project,
    private layout: Layout,
    options: WindowedOptions = {},
  ) {
    this.overscan = options.overscan ?? 2
    this.manualAnchor = options.manualAnchor ?? true
    this.models = project.scenes.map((scene) => ({ scene, doc: null, state: null, textLower: null }))
    this.plugins = [...basePlugins(sceneSchema, this.keys()), crossPlugin()]

    host.classList.add('windowed')
    scroller.classList.toggle('manual-anchor', this.manualAnchor)
    const fragment = document.createDocumentFragment()
    for (const chapter of project.chapters) {
      const title = document.createElement('h2')
      title.className = 'chapter-title'
      title.textContent = chapter.title
      fragment.appendChild(title)
      for (let s = chapter.sceneStart; s < chapter.sceneStart + chapter.sceneCount; s++) {
        const slot = document.createElement('div')
        slot.className = 'slot'
        slot.dataset.i = String(s)
        slot.style.height = estimateSceneHeight(project.scenes[s], layout) + 'px'
        this.slots.push(slot)
        fragment.appendChild(slot)
      }
    }
    host.appendChild(fragment)

    scroller.addEventListener('scroll', this.onScroll, { passive: true })
    host.addEventListener('mousedown', this.onMouseDown, true)
    document.addEventListener('mousemove', this.onMouseMove, true)
    document.addEventListener('mouseup', this.onMouseUp, true)
    host.addEventListener('keydown', this.onKeyDown, true)
    document.addEventListener('copy', this.onCopy, true)
    document.addEventListener('cut', this.onCopy, true)
    this.lastWidth = scroller.clientWidth
    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(scroller)
    this.update()
  }

  destroy(): void {
    cancelAnimationFrame(this.frameRequest)
    this.resizeObserver.disconnect()
    this.scroller.removeEventListener('scroll', this.onScroll)
    this.host.removeEventListener('mousedown', this.onMouseDown, true)
    document.removeEventListener('mousemove', this.onMouseMove, true)
    document.removeEventListener('mouseup', this.onMouseUp, true)
    this.host.removeEventListener('keydown', this.onKeyDown, true)
    document.removeEventListener('copy', this.onCopy, true)
    document.removeEventListener('cut', this.onCopy, true)
    for (const view of this.views.values()) view.destroy()
    this.views.clear()
    this.host.textContent = ''
    this.host.classList.remove('windowed', 'xsel-on')
    this.scroller.classList.remove('manual-anchor')
  }

  // ---- model access ---------------------------------------------------------

  private docOf(index: number): PMNode {
    const model = this.models[index]
    return (model.doc ??= buildSceneDoc(model.scene))
  }

  private stateOf(index: number): EditorState {
    const model = this.models[index]
    return (model.state ??= EditorState.create({ doc: this.docOf(index), plugins: this.plugins }))
  }

  /** Applies a transaction to a scene whether or not it is mounted. */
  private applyTo(index: number, build: (state: EditorState) => Transaction): void {
    const view = this.views.get(index)
    if (view) {
      view.dispatch(build(view.state))
      return
    }
    const model = this.models[index]
    const tr = build(this.stateOf(index))
    model.state = this.stateOf(index).apply(tr)
    if (tr.docChanged) {
      model.doc = model.state.doc
      model.textLower = null
      // The placeholder height is now stale; fall back to an estimate.
      this.slots[index].style.height = estimateDocHeight(model.doc, this.layout) + 'px'
    }
  }

  private textLowerOf(index: number): string {
    const model = this.models[index]
    if (model.textLower === null) {
      const text = model.doc ? model.doc.textBetween(0, model.doc.content.size, '\n') : fixtureText(model.scene, '\n')
      model.textLower = text.toLowerCase()
    }
    return model.textLower
  }

  sceneText(index: number): string {
    const model = this.models[index]
    return model.doc ? model.doc.textBetween(0, model.doc.content.size, '\n\n') : fixtureText(model.scene, '\n\n')
  }

  projectText(): string {
    const parts: string[] = []
    for (let i = 0; i < this.models.length; i++) parts.push(this.sceneText(i))
    return parts.join('\n\n')
  }

  // ---- windowing ------------------------------------------------------------

  /** Index of the last slot whose top is at or above y (scroll coordinates). */
  private slotAt(y: number): number {
    let lo = 0
    let hi = this.slots.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.slots[mid].offsetTop <= y) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  private pinned(): Set<number> {
    const pinned = new Set<number>()
    if (this.focused !== null) {
      // The scene with the selection, plus its neighbours so that arrow keys
      // always have a mounted editor to move into.
      for (const i of [this.focused - 1, this.focused, this.focused + 1]) {
        if (i >= 0 && i < this.slots.length && (i === this.focused || this.views.has(i))) pinned.add(i)
      }
    }
    if (this.cross) {
      pinned.add(this.cross.anchor.scene)
      pinned.add(this.cross.head.scene)
    }
    for (const [i, view] of this.views) if (view.composing || view.hasFocus()) pinned.add(i)
    if (this.dragFrom !== null) pinned.add(this.dragFrom)
    return pinned
  }

  private onScroll = () => this.update()

  /** Brings the mounted set in line with the viewport. Scenes that intersect the
   *  viewport mount at once; overscan scenes mount one per frame. */
  update = (): void => {
    const scroller = this.scroller
    const top = scroller.scrollTop
    const vh = scroller.clientHeight
    const visFirst = this.slotAt(top)
    const visLast = this.slotAt(top + vh)
    const first = this.slotAt(Math.max(0, top - this.overscan * vh))
    const last = this.slotAt(top + vh + this.overscan * vh)
    const pinned = this.pinned()

    const toUnmount: number[] = []
    for (const i of this.views.keys()) if ((i < first || i > last) && !pinned.has(i)) toUnmount.push(i)
    const toMount: number[] = []
    for (let i = visFirst; i <= visLast; i++) if (!this.views.has(i)) toMount.push(i)
    let deferred = 0
    if (toMount.length === 0) {
      // Nearest missing overscan scene, alternating below and above.
      for (let d = 1; d <= Math.max(last - visLast, visFirst - first); d++) {
        const below = visLast + d
        const above = visFirst - d
        if (below <= last && !this.views.has(below)) {
          if (toMount.length === 0) toMount.push(below)
          else deferred++
        }
        if (above >= first && !this.views.has(above)) {
          if (toMount.length === 0) toMount.push(above)
          else deferred++
        }
      }
    } else {
      deferred = 1
    }
    this.applyChanges(toUnmount, toMount)
    if (deferred > 0 && !this.frameRequest) {
      this.frameRequest = requestAnimationFrame(() => {
        this.frameRequest = 0
        this.update()
      })
    }
  }

  /** Mounts and unmounts scenes while keeping what is on screen where it is. */
  private applyChanges(toUnmount: number[], toMount: number[], anchorSlot?: HTMLElement): void {
    if (toUnmount.length === 0 && toMount.length === 0) return
    const scroller = this.scroller
    let anchor: HTMLElement | null = anchorSlot ?? null
    if (!anchor && this.manualAnchor) {
      const changing = new Set<number>([...toUnmount, ...toMount])
      const top = scroller.scrollTop
      const visFirst = this.slotAt(top)
      const visLast = this.slotAt(top + scroller.clientHeight)
      for (let i = visFirst; i <= visLast; i++) {
        if (!changing.has(i)) {
          anchor = this.slots[i]
          break
        }
      }
      anchor ??= this.slots[visFirst]
    }
    const before = anchor ? anchor.getBoundingClientRect().top : 0

    // Read all heights first, then write, to avoid layout thrash.
    const heights = toUnmount.map((i) => this.slots[i].offsetHeight)
    toUnmount.forEach((i, k) => this.unmount(i, heights[k]))
    for (const i of toMount) this.mount(i)

    if (anchor) {
      const delta = anchor.getBoundingClientRect().top - before
      if (delta !== 0) {
        scroller.scrollTop += delta
        this.comp += delta
        this.stats.compensations++
        this.stats.maxCompPx = Math.max(this.stats.maxCompPx, Math.abs(delta))
      }
    }
  }

  private mount(index: number): void {
    if (this.views.has(index)) return
    const start = performance.now()
    const slot = this.slots[index]
    const model = this.models[index]
    const view: EditorView = new EditorView(slot, {
      state: this.stateOf(index),
      dispatchTransaction: (tr) => {
        const next = view.state.apply(tr)
        view.updateState(next)
        model.state = next
        if (tr.docChanged) {
          model.doc = next.doc
          model.textLower = null
          if (this.cross && !tr.getMeta('cross-edit')) this.clearCross()
        }
      },
      handleDOMEvents: {
        focus: () => {
          this.focused = index
          return false
        },
      },
      attributes: { 'data-scene': String(index) },
    })
    this.viewIndex.set(view, index)
    this.views.set(index, view)
    slot.style.height = ''
    slot.classList.add('mounted')
    this.syncCross(index)
    if (this.findScene === index && this.needle) this.syncFindMark(index)
    const ms = performance.now() - start
    this.stats.mounts++
    this.stats.mountMs += ms
    this.stats.lastMountMs = ms
    this.stats.maxMountMs = Math.max(this.stats.maxMountMs, ms)
  }

  private unmount(index: number, height: number): void {
    const view = this.views.get(index)
    if (!view) return
    this.models[index].state = view.state
    view.destroy()
    this.views.delete(index)
    const slot = this.slots[index]
    slot.style.height = height + 'px'
    slot.classList.remove('mounted')
    this.stats.unmounts++
  }

  private ensureMounted(index: number): EditorView {
    if (!this.views.has(index)) this.applyChanges([], [index])
    return this.views.get(index)!
  }

  private onResize(): void {
    const width = this.scroller.clientWidth
    if (width === this.lastWidth) {
      this.update()
      return
    }
    // Width changed: every remembered height is wrong. Re-estimate the
    // placeholders and keep the first visible scene at the top.
    this.lastWidth = width
    const anchorIndex = this.slotAt(this.scroller.scrollTop)
    const offset = this.scroller.scrollTop - this.slots[anchorIndex].offsetTop
    const perLineBefore = this.layout.contentWidth
    this.layout = { ...this.layout, contentWidth: Math.max(120, Math.min(680, width) - 32) }
    for (let i = 0; i < this.slots.length; i++) {
      if (this.views.has(i)) continue
      const model = this.models[i]
      const height = model.doc ? estimateDocHeight(model.doc, this.layout) : estimateSceneHeight(model.scene, this.layout)
      this.slots[i].style.height = height + 'px'
    }
    this.scroller.scrollTop = this.slots[anchorIndex].offsetTop + offset * (perLineBefore / this.layout.contentWidth)
    this.update()
  }

  mountedCount(): number {
    return this.views.size
  }

  blankPx(): number {
    const top = this.scroller.scrollTop
    const bottom = top + this.scroller.clientHeight
    let blank = 0
    const last = this.slotAt(bottom)
    for (let i = this.slotAt(top); i <= last; i++) {
      if (this.views.has(i)) continue
      const slot = this.slots[i]
      const a = Math.max(top, slot.offsetTop)
      const b = Math.min(bottom, slot.offsetTop + slot.offsetHeight)
      if (b > a) blank += b - a
    }
    return blank
  }

  compensation(): number {
    return this.comp
  }

  // ---- navigation -----------------------------------------------------------

  jumpToScene(index: number, offset = 0): void {
    const slot = this.slots[index]
    this.clearCross()
    this.scroller.scrollTop = slot.offsetTop
    // Mount the target first, holding its top edge still, then let update()
    // add what else the viewport needs.
    if (!this.views.has(index)) this.applyChanges([], [index], slot)
    this.focused = index
    this.update()
    this.scroller.scrollTop = slot.offsetTop
    const view = this.views.get(index)!
    const doc = view.state.doc
    const selection = Selection.near(doc.resolve(Math.min(Math.max(0, offset), doc.content.size)), 1)
    view.dispatch(view.state.tr.setSelection(selection))
    if (offset > 0) {
      scrollPosTo(view, this.scroller, selection.head, 0.35)
      this.update()
    }
    view.focus()
  }

  position(): { scene: number; offset: number } {
    const view = this.focused !== null ? this.views.get(this.focused) : undefined
    if (view && this.focused !== null) return { scene: this.focused, offset: view.state.selection.head }
    return { scene: this.slotAt(this.scroller.scrollTop), offset: 0 }
  }

  activeView(): EditorView | null {
    return this.focused !== null ? (this.views.get(this.focused) ?? null) : null
  }

  toggleMark(name: 'em' | 'strong'): void {
    const view = this.activeView()
    if (!view) return
    toggleMark(sceneSchema.marks[name])(view.state, view.dispatch)
    view.focus()
  }

  private ensureVisible(view: EditorView, pos: number): void {
    const coords = view.coordsAtPos(pos)
    const rect = this.scroller.getBoundingClientRect()
    if (coords.bottom > rect.bottom - 8) this.scroller.scrollTop += coords.bottom - rect.bottom + LINE
    else if (coords.top < rect.top + 8) this.scroller.scrollTop -= rect.top - coords.top + LINE
    else return
    this.update()
  }

  // ---- keys that cross scene boundaries ---------------------------------------

  private keys(): Record<string, Command> {
    const arrow =
      (dir: 1 | -1, unit: 'char' | 'line', extend: boolean): Command =>
      (_state, _dispatch, view) =>
        view ? this.arrow(view, dir, unit, extend) : false
    return {
      ArrowDown: arrow(1, 'line', false),
      ArrowUp: arrow(-1, 'line', false),
      ArrowRight: arrow(1, 'char', false),
      ArrowLeft: arrow(-1, 'char', false),
      'Shift-ArrowDown': arrow(1, 'line', true),
      'Shift-ArrowUp': arrow(-1, 'line', true),
      'Shift-ArrowRight': arrow(1, 'char', true),
      'Shift-ArrowLeft': arrow(-1, 'char', true),
      Backspace: (_state, _dispatch, view) => (view ? this.backspace(view) : false),
      'Mod-a': () => {
        this.selectAll()
        return true
      },
    }
  }

  /** Handles an arrow key only when the caret is at the edge of its scene. */
  private arrow(view: EditorView, dir: 1 | -1, unit: 'char' | 'line', extend: boolean): boolean {
    const index = this.viewIndex.get(view)
    if (index === undefined) return false
    const { selection, doc } = view.state
    if (!extend && !selection.empty) return false
    const target = index + dir
    if (target < 0 || target >= this.slots.length) return false
    const edge = dir > 0 ? Selection.atEnd(doc) : Selection.atStart(doc)
    const $head = selection.$head
    if (unit === 'char') {
      if ($head.pos !== edge.head) return false
    } else if (!$head.sameParent(edge.$head) || !view.endOfTextblock(dir > 0 ? 'down' : 'up')) {
      return false
    }
    const goalX = unit === 'line' ? view.coordsAtPos($head.pos).left : null
    const point = this.edgePoint(target, dir, goalX)
    if (extend) {
      this.setCross({ scene: index, pos: selection.anchor }, point, goalX)
      return true
    }
    const next = this.views.get(target)!
    next.dispatch(next.state.tr.setSelection(Selection.near(next.state.doc.resolve(point.pos), dir)).scrollIntoView())
    next.focus()
    return true
  }

  /** The position a caret entering `scene` from the given direction lands on. */
  private edgePoint(scene: number, dir: 1 | -1, goalX: number | null): Point {
    const view = this.ensureMounted(scene)
    const doc = view.state.doc
    let pos = (dir > 0 ? Selection.atStart(doc) : Selection.atEnd(doc)).head
    this.ensureVisible(view, pos)
    if (goalX !== null) {
      // Keep the caret's column, as vertical movement inside one editor would.
      const coords = view.coordsAtPos(pos)
      const hit = view.posAtCoords({ left: goalX, top: (coords.top + coords.bottom) / 2 })
      if (hit) pos = hit.pos
    }
    return { scene, pos }
  }

  /** Backspace at the very start of a scene joins its first block onto the end
   *  of the previous scene, as it would join two paragraphs in one document. */
  private backspace(view: EditorView): boolean {
    const index = this.viewIndex.get(view)
    if (index === undefined || index === 0) return false
    const { selection, doc } = view.state
    if (!selection.empty || selection.head !== Selection.atStart(doc).head) return false
    const first = doc.firstChild!
    const prevIndex = index - 1
    const prev = this.ensureMounted(prevIndex)
    const prevDoc = prev.state.doc
    const last = prevDoc.lastChild!
    const joinPos = prevDoc.content.size - 1
    if (first.type.name === 'paragraph' && last.isTextblock) {
      prev.dispatch(prev.state.tr.insert(joinPos, first.content))
      const tr = view.state.tr
      if (doc.childCount > 1) tr.delete(0, first.nodeSize)
      else tr.delete(1, first.nodeSize - 1)
      view.dispatch(tr)
    }
    const at = this.views.get(prevIndex)!
    const $pos = at.state.doc.resolve(Math.min(joinPos, at.state.doc.content.size))
    at.dispatch(at.state.tr.setSelection(Selection.near($pos, -1)).scrollIntoView())
    at.focus()
    return true
  }

  // ---- cross-scene selection ------------------------------------------------

  private ordered(): [Point, Point] | null {
    if (!this.cross) return null
    const { anchor, head } = this.cross
    const forward = anchor.scene < head.scene || (anchor.scene === head.scene && anchor.pos <= head.pos)
    return forward ? [anchor, head] : [head, anchor]
  }

  private rangeFor(index: number): CrossRange {
    const ends = this.ordered()
    if (!ends) return null
    const [a, b] = ends
    if (index < a.scene || index > b.scene) return null
    if (index > a.scene && index < b.scene) return 'full'
    const size = this.docOf(index).content.size
    if (index === a.scene && index === b.scene) return { from: a.pos, to: b.pos }
    if (index === a.scene) return a.pos <= 1 ? 'full' : { from: a.pos, to: size }
    return b.pos >= size - 1 ? 'full' : { from: 0, to: b.pos }
  }

  private syncCross(index: number): void {
    const view = this.views.get(index)
    if (!view) return
    const want = this.rangeFor(index)
    const have = crossKey.getState(view.state) ?? null
    const same =
      want === have ||
      (want !== null && have !== null && want !== 'full' && have !== 'full' && want.from === have.from && want.to === have.to)
    if (!same) view.dispatch(view.state.tr.setMeta(crossKey, want))
  }

  private setCross(anchor: Point, head: Point, goalX: number | null = null): void {
    if (anchor.scene === head.scene) {
      // Back inside one scene: hand over to the native selection.
      this.clearCross()
      const view = this.ensureMounted(anchor.scene)
      const doc = view.state.doc
      view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, anchor.pos, head.pos)))
      view.focus()
      return
    }
    this.cross = { anchor, head, goalX }
    this.host.classList.add('xsel-on')
    for (const index of this.views.keys()) this.syncCross(index)
  }

  clearCross(): void {
    if (!this.cross) return
    this.cross = null
    this.host.classList.remove('xsel-on')
    for (const index of this.views.keys()) this.syncCross(index)
  }

  hasCross(): boolean {
    return this.cross !== null
  }

  selectAll(): void {
    const last = this.models.length - 1
    this.setCross(
      { scene: 0, pos: Selection.atStart(this.docOf(0)).head },
      { scene: last, pos: Selection.atEnd(this.docOf(last)).head },
    )
  }

  selectionText(): string {
    const ends = this.ordered()
    if (!ends) {
      const view = this.activeView()
      if (!view) return ''
      const { from, to } = view.state.selection
      return view.state.doc.textBetween(from, to, '\n\n')
    }
    const [a, b] = ends
    const parts: string[] = []
    for (let i = a.scene; i <= b.scene; i++) {
      if (i > a.scene && i < b.scene) {
        // Middle scenes are read from the model without building documents.
        parts.push(this.sceneText(i))
        continue
      }
      const doc = this.docOf(i)
      const from = i === a.scene ? a.pos : 0
      const to = i === b.scene ? b.pos : doc.content.size
      parts.push(doc.textBetween(from, to, '\n\n'))
    }
    return parts.join('\n\n')
  }

  /** Deletes the cross-scene selection through the model. The scenes at both
   *  ends keep what is outside the selection; scenes in between are emptied
   *  (removing them from the tree is a project operation, not an edit). */
  private deleteCross(): void {
    const ends = this.ordered()
    if (!ends) return
    const [a, b] = ends
    for (let i = a.scene; i <= b.scene; i++) {
      this.applyTo(i, (state) => {
        const size = state.doc.content.size
        const from = i === a.scene ? a.pos : Selection.atStart(state.doc).head
        const to = i === b.scene ? b.pos : Selection.atEnd(state.doc).head
        const tr = state.tr.setMeta('cross-edit', true)
        if (to > from && from <= size) tr.deleteRange(from, Math.min(to, size))
        return tr
      })
    }
    this.clearCross()
    const view = this.ensureMounted(a.scene)
    const $pos = view.state.doc.resolve(Math.min(a.pos, view.state.doc.content.size))
    view.dispatch(view.state.tr.setSelection(Selection.near($pos, -1)).scrollIntoView())
    view.focus()
  }

  /** Moves the head of an active cross-scene selection (Shift + arrow). */
  private extendCross(dir: 1 | -1, unit: 'char' | 'line'): void {
    if (!this.cross) return
    const { anchor, head } = this.cross
    const view = this.ensureMounted(head.scene)
    const doc = view.state.doc
    this.ensureVisible(view, head.pos)
    let next: Point | null = null
    let goalX = this.cross.goalX
    if (unit === 'char') {
      goalX = null
      const edge = (dir > 0 ? Selection.atEnd(doc) : Selection.atStart(doc)).head
      if (head.pos !== edge) {
        const found = Selection.findFrom(doc.resolve(head.pos + dir), dir, true)
        if (found) next = { scene: head.scene, pos: found.head }
      }
    } else {
      const coords = view.coordsAtPos(head.pos)
      goalX ??= coords.left
      const y = dir > 0 ? coords.bottom + LINE / 2 : coords.top - LINE / 2
      const hit = view.posAtCoords({ left: goalX, top: y })
      if (hit && hit.inside >= 0 && (dir > 0 ? hit.pos > head.pos : hit.pos < head.pos)) next = { scene: head.scene, pos: hit.pos }
    }
    if (!next) {
      const target = head.scene + dir
      if (target < 0 || target >= this.slots.length) return
      next = this.edgePoint(target, dir, unit === 'line' ? goalX : null)
    }
    this.setCross(anchor, next, goalX)
    const headView = this.views.get(next.scene)
    if (headView) this.ensureVisible(headView, next.pos)
  }

  private slotIndexAt(target: EventTarget | null): number | null {
    const slot = target instanceof Element ? (target.closest('.slot') as HTMLElement | null) : null
    return slot && slot.dataset.i !== undefined ? Number(slot.dataset.i) : null
  }

  private onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return
    const index = this.slotIndexAt(event.target)
    if (event.shiftKey && index !== null && this.focused !== null && index !== this.focused) {
      // Shift + click in another scene extends the selection across scenes.
      const from = this.views.get(this.focused)
      const to = this.views.get(index)
      const hit = to?.posAtCoords({ left: event.clientX, top: event.clientY })
      if (from && hit) {
        event.preventDefault()
        event.stopPropagation()
        this.setCross(this.cross?.anchor ?? { scene: this.focused, pos: from.state.selection.anchor }, { scene: index, pos: hit.pos })
        return
      }
    }
    this.clearCross()
    this.dragFrom = index
  }

  private onMouseMove = (event: MouseEvent) => {
    if (this.dragFrom === null) return
    if (!(event.buttons & 1)) {
      this.dragFrom = null
      return
    }
    const index = this.slotIndexAt(document.elementFromPoint(event.clientX, event.clientY))
    if (index === null) return
    if (index === this.dragFrom) {
      this.clearCross()
      return
    }
    const from = this.views.get(this.dragFrom)
    const to = this.views.get(index)
    if (!from || !to) return
    const hit = to.posAtCoords({ left: event.clientX, top: event.clientY })
    const pos = hit ? hit.pos : (index > this.dragFrom ? Selection.atStart(to.state.doc) : Selection.atEnd(to.state.doc)).head
    this.setCross(this.cross?.anchor ?? { scene: this.dragFrom, pos: from.state.selection.anchor }, { scene: index, pos })
  }

  private onMouseUp = () => {
    this.dragFrom = null
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.cross) return
    const mod = event.metaKey || event.ctrlKey
    const key = event.key
    if (key === 'Shift' || key === 'Control' || key === 'Meta' || key === 'Alt') return
    if (mod && (key === 'c' || key === 'x' || key === 'a')) return // copy/cut events and select-all handle these
    const arrows: Record<string, [1 | -1, 'char' | 'line']> = {
      ArrowDown: [1, 'line'],
      ArrowUp: [-1, 'line'],
      ArrowRight: [1, 'char'],
      ArrowLeft: [-1, 'char'],
    }
    if (key in arrows) {
      event.preventDefault()
      event.stopPropagation()
      const [dir] = arrows[key]
      if (event.shiftKey) {
        this.extendCross(dir, arrows[key][1])
      } else {
        // Collapse to the end of the selection in the direction of travel.
        const [a, b] = this.ordered()!
        const point = dir > 0 ? b : a
        this.clearCross()
        const view = this.ensureMounted(point.scene)
        const $pos = view.state.doc.resolve(Math.min(point.pos, view.state.doc.content.size))
        view.dispatch(view.state.tr.setSelection(Selection.near($pos, dir)).scrollIntoView())
        view.focus()
      }
      return
    }
    if (key === 'Escape') {
      this.clearCross()
      return
    }
    if (key === 'Backspace' || key === 'Delete') {
      event.preventDefault()
      event.stopPropagation()
      this.deleteCross()
      return
    }
    if (!mod && (key.length === 1 || key === 'Enter')) {
      // Typing replaces the selection: delete through the model, then let the
      // key go to the editor that now holds the caret.
      this.deleteCross()
    }
  }

  private onCopy = (event: ClipboardEvent) => {
    if (!this.cross || !event.clipboardData) return
    event.clipboardData.setData('text/plain', this.selectionText())
    event.preventDefault()
    if (event.type === 'cut') this.deleteCross()
  }

  // ---- find -----------------------------------------------------------------

  find(query: string): FindResult {
    const start = performance.now()
    const needle = query.toLowerCase()
    this.needle = needle
    this.matchCounts = new Array(this.models.length)
    let total = 0
    for (let i = 0; i < this.models.length; i++) {
      const count = countInText(this.textLowerOf(i), needle)
      this.matchCounts[i] = count
      total += count
    }
    this.matchTotal = total
    if (!needle && this.findScene >= 0) {
      const view = this.views.get(this.findScene)
      if (view) view.dispatch(view.state.tr.setMeta(findKey, null))
      this.findScene = -1
    }
    return { count: total, ms: performance.now() - start }
  }

  private findTarget: { from: number; to: number } | null = null

  private syncFindMark(index: number): void {
    const view = this.views.get(index)
    if (view && this.findTarget) view.dispatch(view.state.tr.setMeta(findKey, this.findTarget))
  }

  gotoMatch(n: number): void {
    if (this.matchTotal === 0) return
    let rest = ((n % this.matchTotal) + this.matchTotal) % this.matchTotal
    let scene = 0
    while (rest >= this.matchCounts[scene]) rest -= this.matchCounts[scene++]
    const positions = findInDoc(this.docOf(scene), this.needle)
    const from = positions[Math.min(rest, positions.length - 1)]
    if (from === undefined) return
    const to = from + this.needle.length
    if (this.findScene >= 0 && this.findScene !== scene) {
      const old = this.views.get(this.findScene)
      if (old) old.dispatch(old.state.tr.setMeta(findKey, null))
    }
    this.findScene = scene
    this.findTarget = { from, to }
    const slot = this.slots[scene]
    if (!this.views.has(scene)) {
      this.scroller.scrollTop = slot.offsetTop
      this.applyChanges([], [scene], slot)
    }
    const view = this.views.get(scene)!
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)).setMeta(findKey, this.findTarget))
    scrollPosTo(view, this.scroller, from, 0.35)
    this.update()
  }

  debug(): Record<string, unknown> {
    return {
      ...this.stats,
      mounted: [...this.views.keys()].sort((a, b) => a - b),
      focused: this.focused,
      cross: this.cross,
      comp: this.comp,
      docsBuilt: this.models.reduce((n, m) => n + (m.doc ? 1 : 0), 0),
      manualAnchor: this.manualAnchor,
    }
  }
}
