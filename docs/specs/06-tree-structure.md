# Package 06: Tree and structure

## Goal

The writer sees the project's structure, moves through it, and reshapes it: create, rename, reorder, split, merge and delete folders and scenes.

## User-visible behaviour

- **Where.** On wide screens the tree is a sidebar on the left, toggled with a button and a shortcut. Under 720 CSS px it is a bottom sheet opened from a button in the top bar; choosing a scene closes the sheet.
- **What it shows.** Folders and scenes in order. Each row has an icon for its kind, the title, and a word count; a folder's count is the sum of its scenes. A status other than `none` shows as a small marker. The total word count is at the bottom. A scene without a title shows "Untitled scene"; a folder without one shows "Untitled folder".
- **Going somewhere.** Choosing a scene moves the editor to its start. Choosing a folder moves to its first scene and expands it. The row of the scene that holds the caret is highlighted, and the tree scrolls to keep it visible.
- **Creating.** "New scene" adds a scene after the selected node (or inside the selected folder, at its end) and puts the caret in it. "New folder" likewise. The new row's title is immediately editable.
- **Renaming.** Double-click, F2, or "Rename" in the row menu edits the title in place; Enter commits, Escape cancels.
- **Reordering.** A row can be dragged to a new place, between rows or into a folder; a line or a highlighted folder shows where it will land. On touch, dragging starts from a handle on the row. From the keyboard, Alt+Up and Alt+Down move the row among its siblings, Alt+Right moves it into the folder above it, Alt+Left moves it out of its folder.
- **Row menu.** New scene, New folder, Rename, Details, Split at caret (only on the scene holding the caret), Merge with previous scene (only on a scene that has a previous scene), Move to Trash.
- **Details.** A dialog with title, synopsis (plain text), status, and labels (comma-separated).
- **Trash.** A row at the bottom of the tree opens the Trash view: trashed nodes with "Restore" and "Delete for good", and "Empty Trash". Deleting for good asks for confirmation and says that snapshots of those scenes are deleted too.
- Expanded and collapsed folders are remembered per project on the device.

## Contracts provided

`src/features/tree/TreePanel.tsx` replaces the stub. Nothing else is exported. The feature registers the shortcuts `scene.new`, `scene.split` and `view.sidebar`.

## Contracts consumed

- Package 04: `ProjectStore` (all tree methods, `stats`, `totalWords`, `splitScene`, `mergeWithPrevious`), `Navigator` (`current`, `goTo`), `useProject`.
- Package 01: `model/tree.ts`.
- Package 00: `Dialog`, `Sheet`, shortcuts, `isNarrow`.

Split uses `navigator.current()` for the caret; this package does not call the editor.

## Data model changes

None in the database. `localStorage` key `fjader.tree.<projectId>` holds the ids of collapsed folders.

## Acceptance criteria

Browser tests in both engines.

1. Dragging a scene from one folder into another, between two scenes, changes the manuscript order accordingly, and the order is the same after reopening the project.
2. Each keyboard move (Alt+Up, Down, Left, Right) produces the same result as the equivalent drag.
3. A folder cannot be dropped into itself or its descendants; the drop indicator does not appear there.
4. "Split at caret" with the caret in the middle of a scene yields two adjacent rows; the second scene's text starts with the text after the caret.
5. "Merge with previous scene" yields one row with both texts and the other scene in the Trash.
6. Moving a folder to the Trash removes it and its scenes from the tree and from the editor; restoring it brings them back in place.
7. "Empty Trash" deletes the nodes; they are absent after reopening.
8. A word count in the tree changes within one second of typing in that scene.
9. Renaming with Enter commits; Escape restores the old title.
10. On a 390 px wide viewport the tree opens as a sheet, and choosing a scene closes it and moves the editor.
11. The tree has no axe violations; with a keyboard alone a tester can create a scene, rename it, move it into another folder, and trash it.

## Performance budgets

- Contributes to "jump to any scene, at most 200 ms on a phone": the time from choosing a row to the `goTo` call is at most 16 ms on the fixture.
- Opening the tree on the fixture (about 750 nodes) takes at most 100 ms at four times CPU slowdown in Chromium. Folders start collapsed except the one holding the caret. Rows are plain DOM; no virtual list unless this budget fails.
- A move updates the tree within 100 ms.

## Accessibility and mobile

- The tree follows the WAI-ARIA tree pattern: `role="tree"`, rows as `treeitem` with `aria-level`, `aria-expanded` and `aria-selected`; Up and Down move, Right and Left expand and collapse, Home and End go to the ends, typing a letter jumps to the next title starting with it.
- Every drag has the keyboard equivalent above and the result is announced ("Moved to Chapter 3, position 2").
- Rows are at least 44 px high on touch devices. The drag handle is a button with a label.

## Out of scope

Cards and outline views (Phase 4). Multiple selection. Colour for labels. Undo of tree operations. Copying nodes between projects.

## Dependencies

Package 04. Package 05 is needed only for the end-to-end tests that check the editor's content.
