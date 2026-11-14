# Package 10: Quick open, bookmarks, history

## Goal

The writer reaches any scene or folder in a few keystrokes, marks places to return to, and steps back and forward through the places visited.

## User-visible behaviour

- **Quick open.** One shortcut, and a button in the top bar, opens a field over the text. Typing filters scenes and folders by title; each result shows its title and folder path. Enter or a tap goes to the top result's start. With an empty field the list shows the ten most recently visited scenes. Escape closes it.
  - Matching: a result matches when the typed letters appear in order in the title, ignoring case. Results are ranked: title starts with the text, then a word in the title starts with it, then letters in order; ties in manuscript order.
  - Untitled scenes are listed as "Untitled scene" with their folder path and position ("Scene 4").
- **Bookmarks.** One shortcut, and an item in the navigation menu, adds a bookmark at the caret, or removes it if the caret's paragraph already has one. The bookmarks menu lists them in manuscript order, each with its label or, if it has none, the scene title and the first words of the bookmarked paragraph. Choosing one goes there. Each can be renamed and deleted from the menu.
- **Back and forward.** Two buttons in the top bar and two shortcuts step through earlier positions, like a browser's history but inside the project. A position is recorded each time the writer goes somewhere by the tree, quick open, find, search, a bookmark, or back and forward themselves; ordinary typing and scrolling do not record positions.

## Contracts provided

- `src/features/navigation/NavigationControls.tsx` replaces the stub: the back and forward buttons, the quick open button, and the bookmarks menu. `QuickOpen.tsx` is rendered from it as a dialog.
- **Storage handlers**, replacing the stubs in `handlers/bookmarks.ts`: `listBookmarks()` (bookmarks whose scene is live, in manuscript order then by offset), `putBookmark(b)` (insert or replace by id), `deleteBookmark(id)`.
- `src/features/navigation/rank.ts`: `rank(query: string, items: { id: NodeId; title: string }[]): NodeId[]`, pure and unit-tested.
- Registers the shortcuts `nav.quickOpen`, `nav.back`, `nav.forward`, `bookmark.toggle`.

## Contracts consumed

- Package 04: `Navigator` (`current`, `goTo`, `back`, `forward`, `canGoBack`, `canGoForward`), `ProjectStore` (nodes, paths, `manuscript`, `indexOf`), `SceneStore.acquire` to read the bookmarked paragraph's first words when the menu opens.
- Package 03: the handler table.
- Package 01: `Bookmark`, `model/tree.ts`, `model/text.ts`.

This package does not call the editor: every movement goes through `navigator.goTo`.

## Data model changes

None in the schema; uses the `bookmark` table of version 1. A bookmark's `offset` is the start of the paragraph that held the caret. It is not adjusted when text before it changes; going to a bookmark clamps the offset to the scene's length (`architecture.md` section 4.4).

## Acceptance criteria

1. Unit: `rank` orders a start-of-title match before a start-of-word match before an in-order match, and returns nothing when the letters do not appear in order.
2. Quick open with a scene's exact title as the query lists that scene first; Enter moves the caret to the start of that scene. (Both engines, on the fixture.)
3. With an empty query, quick open lists the scenes visited most recently, newest first.
4. Adding a bookmark, reopening the project, and choosing the bookmark moves the caret to the start of the bookmarked paragraph.
5. Toggling the bookmark shortcut twice in the same paragraph leaves no bookmark.
6. A bookmark in a trashed scene is not listed; restoring the scene lists it again; deleting the scene for good deletes the bookmark.
7. Going to scene A by the tree, to B by quick open, then Back, places the caret where it was in A; Forward returns to B. Back is disabled when there is no earlier position.
8. Typing or scrolling between two navigations adds no history entry.
9. No axe violations with quick open and with the bookmarks menu open.

## Performance budgets

- Jump to any scene, from choosing it to text painted and editable: at most 200 ms on a phone, 100 ms on desktop. Measured from Enter in quick open to the frame with the caret, on the fixture, for a never-visited scene. The editor's part is proven by package 05; this package must not add more than 16 ms before `goTo`.
- Filtering 750 titles takes at most 8 ms per keystroke at four times CPU slowdown.

## Accessibility and mobile

- Quick open follows the WAI-ARIA combobox pattern with a list box: Up and Down move the active result, Enter chooses, the active result is announced.
- The bookmarks menu is a `popover` menu; each bookmark's rename and delete are reachable by keyboard.
- On narrow screens quick open is a full-width sheet at the top, so that results stay above the keyboard; the back and forward buttons remain in the top bar.

## Out of scope

Characters and locations in quick open (they arrive with the story bible). Go to page (scripts, Phase 2). Bookmarks that follow their text exactly through edits. A history that survives closing the project.

## Dependencies

Packages 03 and 04. Package 05 for the end-to-end tests.
