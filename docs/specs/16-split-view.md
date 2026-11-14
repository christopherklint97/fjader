# Package 16: Split view

## Goal

On a wide screen the writer can see and edit two places in the manuscript side by side.

## User-visible behaviour

- A command and a button, available when the window is at least 1,100 CSS px wide, split the text area into two equal panes side by side. The same command closes the second pane.
- The second pane opens at the first pane's position. Each pane scrolls, selects and types independently.
- The pane that last had focus is the **active pane**, shown by a thin accent line. The tree, quick open, find, search, bookmarks, and back and forward act on the active pane.
- The same scene can be open in both panes. A change made in one appears in the other at once.
- Undo and redo are one history for the project, whichever pane has focus; the change is revealed in the active pane.
- If the window becomes narrower than 1,100 CSS px, the second pane closes and the active pane's position is kept.
- Whether the view was split is not remembered across restarts.

## Contracts provided

- `src/editor/EditorPanes.tsx` renders one or two panes, each created with `createEditorPane` and its own `paneId` (`'a'` and `'b'`), and keeps `useActivePane()` pointing at the active one.
- `src/editor/panes.ts`: `isSplit()`, `setSplit(on: boolean)`, `subscribeSplit(listener)`.
- Registers the shortcut `view.split`.

No interface in `architecture.md` changes: `Navigator.report` already carries the pane id, `Navigator.goTo` is delivered to the active pane only, and `SceneStore.acquire` is counted, so a scene mounted in both panes is released when both have unmounted it.

## Contracts consumed

- Package 05: `createEditorPane`, the pane's mounting and pinning rules.
- Package 07: cross-scene selection, which is per pane.
- Package 04: `SceneStore`, `UndoCoordinator`, `Navigator`.
- Package 08: the toolbar follows `useActivePane()`.

## Data model changes

None. `meta.last_position` records the active pane's position.

## Acceptance criteria

Browser tests at 1,280 by 800 in both engines.

1. Splitting shows two panes at the same position; scrolling one does not move the other.
2. With the same scene visible in both, typing in pane A shows the text in pane B within one frame, and the caret in pane B does not move.
3. Typing in pane A, then in pane B, then pressing Undo twice reverts both changes in reverse order.
4. Choosing a scene in the tree moves the active pane only.
5. Find highlights matches in both panes; Next moves the active pane.
6. A scene mounted in both panes stays loaded when one pane scrolls away, and is released when both have.
7. A cross-scene selection in pane A is not shown in pane B.
8. Closing the split keeps the active pane's position and focus.
9. Resizing the window to 1,000 CSS px closes the second pane.
10. No axe violations in split view; each pane is a labelled region ("Editor, left" and "Editor, right").

## Performance budgets

On the fixture, added to `tests/perf/`.

- Keystroke latency with two panes showing the same 500-word scene: within the package 05 thresholds.
- Keystroke latency with two panes showing different scenes: within the same thresholds.
- JavaScript heap with two panes open: at most 60 MB in Chromium.

## Accessibility and mobile

- F6 moves focus between the panes.
- Split view is not offered under 1,100 CSS px, so it does not exist on phones.

## Out of scope

More than two panes. Panes stacked vertically. A draggable divider. Showing something other than the manuscript in the second pane. Synchronised scrolling.

## Dependencies

Packages 05 and 07; package 08 if the toolbar has been built.
