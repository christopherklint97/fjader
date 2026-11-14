# Package 05: Editor, windowed scenes

## Goal

The writer can read and type in the whole manuscript as one continuous text, on a 300,000-word project, within the typing, opening, jumping and scrolling budgets. This package builds the windowing layer of `architecture.md` sections 8.1, 8.2 and 8.4 and the per-scene editors bound to their stored documents. It is the first code to combine ProseMirror with Yjs, so its budget tests are the first measurement of that combination.

## User-visible behaviour

- The project screen shows the manuscript in manuscript order: each folder's title as a heading, each scene's text under it, a thin rule between scenes.
- Clicking or tapping places the caret; typing edits the text. Enter starts a paragraph.
- Bold, italic, underline and strikethrough by shortcut. Paragraph, three heading levels, block quote and scene break are available as commands (the toolbar that offers them is package 08).
- Undo and redo by shortcut, with the behaviour of section 8.5.
- Scrolling is smooth and the text on screen does not jump while distant scenes load.
- The app opens at the last caret position. Rotating the device or resizing the window keeps the same text at the top of the view.
- Pasting inside a scene keeps paragraphs, headings, block quotes and the four text styles and drops everything else.
- A scene with no text shows a placeholder line, "Empty scene", that disappears on focus.

## Contracts provided

`src/editor/index.ts` exports `createEditorPane` and the `EditorPane` interface exactly as in section 8. Details that section leaves open:

```ts
export type EditorCommand =
  | 'toggleEm' | 'toggleStrong' | 'toggleUnderline' | 'toggleStrike'
  | 'setParagraph' | 'setHeading1' | 'setHeading2' | 'setHeading3'
  | 'toggleBlockquote' | 'insertSceneBreak'

export interface FormatState {
  marks: { em: boolean; strong: boolean; underline: boolean; strike: boolean }
  block: 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'blockquote' | 'mixed'
  canEdit: boolean          // false when no scene has focus
}

export type EditorEvent =
  | { type: 'selection'; selection: ProjectSelection | null }
  | { type: 'format'; state: FormatState }
  | { type: 'focus' } | { type: 'blur' }
  | { type: 'viewport'; first: SceneId; last: SceneId }     // scenes intersecting the viewport

```

`GoOptions` is defined in package 01.

- `jumpTo` scrolls the scene's slot into view, mounts it holding its top edge still, places the caret at the offset (or selects the range), and resolves after the frame in which the caret is painted. With `focus: false` it scrolls and selects without taking focus.
- `run` applies the command to the selection inside one scene and returns whether it applied. Commands on a cross-scene selection are package 07.
- `setDecorations` as in section 8.4.
- The pane subscribes to `navigator.onGo` and calls `jumpTo`; it calls `navigator.report` when its caret moves, at most every 250 ms.
- The pane re-reads `ProjectStore.manuscript()` when the store's version changes and adds, removes and reorders slots without disturbing mounted scenes that did not move.

`src/editor/EditorPanes.tsx` replaces the stub from package 04: it renders one pane filling the main region and exposes it to other features through a React context:

```ts
export function useActivePane(): EditorPane | null
```

**DOM contract**, relied on by tests and by packages 07 and 16:

- The scroll container has `role="feed"`.
- Each slot is `<div class="slot" role="article" data-scene-id="…" tabindex="-1">` with an `aria-label` built from the folder path, the scene title and "Scene n of m".
- Each folder heading is `<h2 class="folder-title" data-node-id="…">`.
- A mounted editor is the slot's only child, with `spellcheck="true"` and the project's `lang`.

**Modules** in `src/editor/`:

| Directory | Content |
|---|---|
| `windowing/window.ts` | which scenes are mounted, prefetch, pinning (section 8.1) |
| `windowing/anchor.ts` | `keepAnchor` (section 8.2) and nothing else |
| `windowing/heights.ts` | estimates and remembered heights; reset on width change |
| `scene/` | creating and destroying one scene's `EditorView`: `initProseMirrorDoc`, the binding plugin, `provenancePlugin`, the profile's keymap, the decoration plugin |
| `pane.ts` | `createEditorPane` |

Undo and redo keys call the `UndoCoordinator`; the binding's own undo plugin is not installed. The pane reveals the position the coordinator returns.

## Contracts consumed

- Package 01: `FormatProfile`, `model/text.ts`, `provenancePlugin`.
- Package 04: `ProjectStore`, `SceneStore` (`prefetch`, `has`, `acquire`, `acquireNow`, `release`), `UndoCoordinator`, `Navigator`.
- Package 03 only through 04.

## Data model changes

None. Nothing is stored outside the project.

## Acceptance criteria

Browser tests run in Chromium and WebKit on the fixture unless noted.

1. Typing 500 characters in the middle of a scene and reopening the project shows the same text. (With package 03.)
2. Scrolling from the first scene to the last, the number of mounted scenes never exceeds the scenes inside the window plus the pinned ones, and the document never has more than 2,500 elements.
3. The scene holding the caret stays mounted when the view is scrolled 60,000 px away, and typing still goes into it. A scene with an active input-method composition stays mounted. (Composition is driven through the DevTools protocol in Chromium, as in Spike A.)
4. `jumpTo` to a scene that has never been mounted places the caret at the given offset.
5. After a width change of the scroll container, the block that was first in the viewport is still first.
6. Applying each `EditorCommand` produces the expected document; `formatState()` reflects the selection.
7. `setDecorations` highlights ranges in mounted scenes, and in a scene mounted afterwards.
8. `SceneStore.apply` on a mounted scene updates the visible text.
9. Undo after typing in two scenes reverts the newer change and scrolls it into view.
10. Deleting a scene, creating one, and moving one in the tree (through `ProjectStore`) updates the slots, and a mounted scene that did not move keeps its DOM node.
11. With `?anchor=native`, criteria 1 to 5 still pass.
12. Pasting HTML containing a table, an image, a link and a `<span data-prov="ai">` outside a `data-fjader` element yields paragraphs of unmarked text.
13. No axe violations on the project screen with a project open.

## Performance budgets

All on the fixture, added to `tests/perf/`, under the rules of `architecture.md` section 13 (Chromium at four times CPU slowdown and WebKit unthrottled, both held to the phone budget).

| Budget | Threshold | How measured | Spike A, for comparison |
|---|---|---|---|
| Open project to an editable cursor at the last position, cold | at most 1.5 s | new browser context; navigation start to the frame with a focused caret in the middle scene | 0.79 s at four times slowdown, without storage |
| Same, desktop | at most 800 ms | Chromium unthrottled | 0.23 s |
| Keystroke latency in a 500-word scene, 95th and 99th percentile | at most 32 ms and 100 ms | 500 keys through the browser's key event path, 80 ms apart; from the key event's timestamp to the first frame after the editor applied it | 24 ms and 37 ms |
| Keystroke latency in the 10,000-word scene | at most 32 ms and 100 ms, Chromium unthrottled and WebKit | same | 8 ms unthrottled; 44 ms at four times slowdown, the known exception |
| Jump to any scene | at most 200 ms | `jumpTo` call to the frame with the caret; first, middle, last, the 10,000-word scene, five never-visited scenes | at most 107 ms |
| Scroll position shift when scenes mount or unmount | at most 1 px | a visible paragraph tracked every frame through a slow scroll, a scripted fling, and in Chromium real touch flicks | 0.00 px |
| No blank viewport longer than 100 ms in a fling | longest frame at most 100 ms, Chromium unthrottled and WebKit; no slot intersecting the viewport stays unmounted for more than 100 ms | frame times and a per-frame check of the viewport's slots | one 200 ms frame at four times slowdown |
| JavaScript heap with the project open | at most 50 MB, Chromium | after a forced collection | 10 MB |

The pull request records every figure. If the Yjs binding makes mounting measurably slower than Spike A's unbound editors, the mounting margin and the one-per-frame rule are the first things to tune.

## Accessibility and mobile

- The DOM contract above implements the `feed` and `article` structure of section 14. Focusing an unmounted slot mounts it.
- The caret is kept visible when the on-screen keyboard opens, using `platform/keyboard.ts`; this package creates that file with `keyboardInset(): number` and a subscription. Package 08 uses it for the toolbar.
- Text size follows the root font size; the text column is at most 680 CSS px wide with 16 px side padding.
- No behaviour depends on hover.

## Out of scope

Moving the caret or a selection across a scene boundary with the keyboard or mouse (package 07): until then the caret moves between scenes by click or tap only. The toolbar and focus mode (08). Find (09). A second pane (16). Input rules such as typing `#` for a scene break. Capping the size of very long scenes.

## Dependencies

Packages 01 and 04. Package 03 must be merged before this package's budget tests can pass.
