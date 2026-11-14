# Package 07: Editor, cross-scene editing

## Goal

Scene boundaries stop being walls for the keyboard and the mouse: the caret moves across them with every movement key, a selection can span scenes, and copy, cut, paste, delete and formatting work on such a selection. This is `architecture.md` section 8.3.

## User-visible behaviour

- **Caret movement.** Left and Right at the edge of a scene, Up and Down on its first or last line (the caret keeps its horizontal position), word movement, line start and end, Page Up and Page Down, and document start and end all carry the caret into the neighbouring scene as if the text were continuous. Moving into a scene that is not mounted mounts it first.
- **Backspace and Delete at a boundary.** Backspace at the very start of a scene moves the caret to the end of the previous scene and deletes nothing. Delete at the very end moves to the start of the next scene.
- **Selecting.** Dragging with a mouse from one scene into another, Shift with any movement key, and Shift with a click extend the selection across scenes. Dragging near the top or bottom edge of the view scrolls it. The selection looks the same inside and across scenes.
- **Select All.** The first use selects the scene holding the caret; the second selects the whole manuscript.
- **Editing a selection that spans scenes.** Typing replaces it; Backspace, Delete and Cut remove it; Paste replaces it; the four text style commands apply to all of it. Text is removed from each scene it touches. Scenes are never removed and the two ends are not joined: a scene whose text was wholly selected is left empty. The caret ends where the selection began. One Undo reverts the whole change.
- **Copy and Cut** put plain text and formatted text on the clipboard, for selections of any size, including the whole manuscript.
- **Paste** inserts into the scene holding the caret. Pasted content that came from several scenes arrives as consecutive paragraphs in that one scene.
- **Touch.** A selection made with the system's handles stays within one scene. The selection menu offers "Select scene" and "Select all".

## Contracts provided

Inside `src/editor/`; the `EditorPane` interface does not change.

- `selection/` holds the `ProjectSelection` state, the decorations that draw it, the mouse handlers and the auto-scroll.
- `keys/` holds the boundary rules for every movement key.
- `clipboard/` builds and reads clipboard data.
- `EditorPane.selection()` now returns cross-scene selections, `setSelection()` accepts them, and `run()` applies the four mark commands to them. Block commands on a cross-scene selection return `false`.

**Clipboard formats.**

- `text/plain`: blocks separated by one empty line; scenes separated the same way; a scene break as a line containing `#`.
- `text/html`: `<div data-fjader="1">` containing the blocks as the schema's DOM output, including `data-prov` and `data-gen` on provenance spans. Reading it back through the schema preserves provenance (`architecture.md` section 4.3, rule 4).

**Editing through the stores.** Every change to a cross-scene selection is made with `SceneStore.apply(sceneId, 'edit', …)` for each scene, all inside one `UndoCoordinator.group()`.

## Contracts consumed

- Package 05: the pane, slots, mounting and pinning (both ends of a cross-scene selection are pinned), the DOM contract.
- Package 04: `SceneStore.apply`, `UndoCoordinator.group`, `ProjectStore.manuscript`.
- Package 01: `model/text.ts`, the schema's DOM parse and output.

## Data model changes

None.

## Acceptance criteria

Browser tests in Chromium and WebKit. Criteria 1 to 8 repeat the checks Spike A's `measure/functional.mjs` passed, now against stored documents.

1. From the last character of a scene, Right moves the caret to the first character of the next scene; Left reverses it. From the last line, Down moves to the first line of the next scene at the nearest horizontal position; Up reverses it.
2. Each of these does the same across a boundary as inside a scene: word left and right, line start and end, Page Up, Page Down, document start, document end.
3. Backspace at the start of a scene deletes nothing and leaves the caret at the end of the previous scene; a second Backspace deletes that scene's last character.
4. A mouse drag from the middle of one scene to the middle of the scene after next selects exactly the text between, and `selection()` reports the two positions.
5. Shift+Down repeated from one scene into the next extends the selection across the boundary; Shift+Up shrinks it back.
6. Copying a cross-scene selection puts on the clipboard plain text equal to the text computed from the stored documents. Select All twice then Copy yields the whole manuscript, 1.7 million characters on the fixture.
7. Typing a character over a selection spanning three scenes leaves the first scene ending with that character, the middle scene empty, and the third scene starting after the selection's end; all three scenes still exist.
8. One Undo after criterion 7 restores all three scenes; one Redo applies the change again.
9. Toggling bold on a cross-scene selection marks the selected text in every scene it touches, including a scene that is not mounted.
10. Copying text that carries an `ai` provenance mark (set up by the test) and pasting it into another scene yields text with the same mark and generation id. Pasting the same words from a plain-text clipboard yields unmarked text.
11. Dragging a selection to the bottom edge scrolls the view and keeps extending the selection into scenes that mount during the drag.
12. Scrolling 60,000 px away with a cross-scene selection active keeps both end scenes mounted; scrolling back shows the selection unchanged.
13. On a touch viewport, the selection menu offers "Select scene" and "Select all", and both produce the stated selection.

## Performance budgets

- Keystroke latency with a cross-scene selection present elsewhere in the document stays within the package 05 thresholds.
- Select All twice followed by Copy on the fixture completes within 200 ms at four times CPU slowdown. Spike A measured 7 to 19 ms unthrottled for the copy.
- Deleting a selection that spans 50 scenes completes within 500 ms.

## Accessibility and mobile

- Every operation here is a keyboard operation first.
- The selection is exposed to assistive technology only inside the scene with focus; an announcement states the size of a cross-scene selection when it changes ("Selected 3 scenes, 4,210 words").
- Touch behaviour is as stated. Whether system handles really stop at the boundary is an open real-device check (`README.md`).

## Out of scope

Custom selection handles on touch. Dragging selected text to move it across scenes (inside one scene the browser's behaviour stays). Joining scenes by deleting across a boundary. Block commands on a cross-scene selection. Find and replace.

## Dependencies

Package 05.
