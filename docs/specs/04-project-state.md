# Package 04: Project state and library

## Goal

The main-thread state that every feature reads and writes (the four stores of `architecture.md` section 7), the library screen where projects are created and opened, and the project screen's layout with a named place for each later feature.

## User-visible behaviour

- **Library.** On first start the writer sees an empty library with "New project". Creating a project asks for a title and a language (preset to the browser's language) and opens it. The library lists projects by most recent change with title, word count and date. Each project can be opened, renamed, and deleted after a confirmation that names the project. "Restore from backup" takes a `.fjader` file and adds it to the library as a separate project named "<title> (restored <date>)"; it never replaces an existing project. A file that is not a Fjäder backup, or one made by a newer version of the app, is refused with a message that says which.
- **Start.** Starting the app opens the project that was open last, at the last caret position. If there is none, the library opens.
- **Project screen.** A top bar with the project title, a save indicator ("Saved", "Saving…", or an error), and a menu with "Close project". The text area is empty until package 05.
- **Saving.** The save shortcut flushes storage and shows "All changes saved". There is no manual save otherwise.
- **Second tab.** Opening a project that is open elsewhere shows "This project is open in another tab or window. It will open here when you close it there."
- **Storage problems.** Each `StorageError` code has one screen or notice, as in `architecture.md` section 12.

## Contracts provided

All in `src/project/` unless noted. The interfaces of `SceneStore`, `UndoCoordinator` and `Navigator` are in `architecture.md` sections 7 and 8.5 and are not repeated.

```ts
export function openProject(id: ProjectId, create?: NewProject): Promise<Project>
export interface Project {
  storage: StorageClient
  profile: FormatProfile
  store: ProjectStore
  scenes: SceneStore
  undo: UndoCoordinator
  navigator: Navigator
  close(): Promise<void>
}
export function useProject(): Project      // React context, available inside ProjectScreen

export interface ProjectStore {
  meta(): ProjectMeta
  setMeta(patch: Partial<ProjectMeta>): Promise<void>
  node(id: NodeId): NodeRow | undefined
  children(parentId: NodeId | null): readonly NodeRow[]      // live, ordered
  trashed(): readonly NodeRow[]                              // nodes with trashed_at set
  manuscript(): readonly SceneId[]                           // manuscript order
  indexOf(sceneId: SceneId): number                          // place in manuscript order, -1 if not in it
  stats(sceneId: SceneId): SceneStats                        // live while the scene is loaded, cached otherwise
  totalWords(): number

  createScene(parentId: NodeId | null, after: NodeId | null, init?: { title?: string; doc?: PMNode }): Promise<NodeRow>
  createFolder(parentId: NodeId | null, after: NodeId | null, title?: string): Promise<NodeRow>
  update(id: NodeId, patch: NodePatch): Promise<void>
  move(id: NodeId, parentId: NodeId | null, after: NodeId | null): Promise<void>
  trash(id: NodeId): Promise<void>
  restore(id: NodeId): Promise<void>
  purge(ids: NodeId[]): Promise<void>
  importNodes(nodes: NewNode[]): Promise<void>

  splitScene(at: Position): Promise<SceneId>                 // returns the new scene
  mergeWithPrevious(sceneId: SceneId): Promise<void>

  subscribe(listener: () => void): () => void
  version(): number                                          // changes whenever anything above changes
}
```

Rules:

- Every tree method changes memory first, notifies subscribers, then calls storage. If storage rejects, the store reloads the tree and rethrows.
- `move` rejects a move of a folder into itself or its descendants.
- **Split** creates a new scene directly after the original holding everything from the position onward, waits for storage to confirm it, and only then removes that text from the original with origin `structure`. The position is first moved to the nearest block boundary at or before it if it is inside a block quote; inside a paragraph the paragraph is split.
- **Merge** takes a `pre-merge` snapshot of both scenes (ignoring `not-implemented` until package 11), appends the scene's blocks to the previous scene in manuscript order with origin `structure`, awaits `flush()`, and then trashes the emptied scene.
- Both orders mean that an interruption can duplicate text but never lose it.
- `stats` for a loaded scene is recomputed from its document at most every 250 ms while it changes; `scene-stats` events from storage update the cached values.

**SceneStore, UndoCoordinator, Navigator**: implemented as specified. Additional rules:

- `SceneStore` forwards every Yjs update whose origin is not `load` to `storage.appendUpdate` with the next sequence number, holds it until `durable`, and re-sends held updates after a worker restart (section 6.4, step 5).
- Each scene's `Y.UndoManager` tracks the binding's origin and `edit`, not `structure` or `load`.
- `project.close()`, and the callbacks this package registers with `onHidden` and `beforeReload` (`platform/lifecycle.ts`), call `storage.flush()`.

**Screens and regions**, in `src/app/`:

- `LibraryScreen.tsx`, including "Restore from backup", which calls `open({ projectId: newProjectId(), importFrom })` and then `setMeta({ title })`. It has two empty places filled later: `features/import/ImportEntry.tsx` (package 15) and `features/backup/StorageSettingsEntry.tsx` (package 13).
- `ProjectScreen.tsx` lays out named regions and renders one component in each. This package creates each component as a stub that renders nothing; the owning package replaces the file.

  | Region | Component file | Package |
  |---|---|---|
  | sidebar (bottom sheet when narrow) | `features/tree/TreePanel.tsx` | 06 |
  | main | `editor/EditorPanes.tsx` | 05, 16 |
  | toolbar | `features/toolbar/Toolbar.tsx` | 08 |
  | top bar, right | `features/targets/TargetsIndicator.tsx` | 12 |
  | top bar, navigation | `features/navigation/NavigationControls.tsx` | 10 |
  | overlay | `features/find/FindBar.tsx` | 09 |
  | side panel (bottom sheet when narrow) | `features/search/SearchPanel.tsx`, `features/snapshots/SnapshotsPanel.tsx` | 09, 11 |
  | project menu items | `features/export/ExportMenuItem.tsx`, `features/backup/BackupMenuItems.tsx` | 14, 13 |

- `app/StorageErrorScreen.tsx` and `app/SaveIndicator.tsx`.

## Contracts consumed

- Package 01: all model types and functions.
- Package 03: `createStorageClient`, `listProjects`, `deleteProject`. Until package 03 merges, this package's unit tests use `src/storage/testing/memory-client.ts`, a `StorageClient` over in-memory maps written here; it stays as the test double for every later package's unit tests.
- Package 00: lifecycle, shortcuts, router, `ui/panels.ts`.

## Data model changes

None. Writes `meta.last_position` through `setMeta`, and the `localStorage` key `fjader.lastProject`.

## Acceptance criteria

1. Unit: after any sequence of 500 random tree operations, the store's `children` and `manuscript` equal those computed from the rows the memory client holds.
2. Unit: a storage rejection during `move` leaves the store equal to storage.
3. Unit: `splitScene` in the middle of a paragraph yields two scenes whose plain texts joined equal the original; when storage rejects the creation, the original is unchanged.
4. Unit: `mergeWithPrevious` yields one scene with both texts in order and marks intact, and the other scene in the Trash.
5. Unit: typing in scene A, then B, then A gives three undo steps; `undo()` three times reverts them newest first and returns the position of each; `redo()` restores them; a new edit clears redo.
6. Unit: edits made inside `undo.group()` to three scenes are reverted by one `undo()`.
7. Unit: text moved by a split is not brought back by a later `undo()`.
8. Unit: `SceneStore.apply` on a scene that is not mounted changes its document and produces a stored update; the same call on a mounted scene changes the editor's document. (The second half is tested in package 05.)
9. Unit: a scene with undo history or with updates that are not yet durable is kept in memory after `release`; a scene with neither is destroyed and `closeDoc` is sent.
10. Unit: after a simulated worker restart, every update that was not durable is sent again with its original sequence number.
11. Browser, both engines: create a project, close the tab, reopen the app; the project opens directly. Rename and delete work from the library.
12. Browser: the second-tab notice appears, and the project opens when the first tab is closed.
13. Browser: restoring the fixture file adds a project with a new id whose tree and text equal the fixture's. Restoring a renamed text file, a truncated backup and an unrelated SQLite database each shows "This file is not a Fjäder backup" and adds nothing to the library or to storage. Restoring a file with a higher schema version shows "This backup was made with a newer version of Fjäder" and adds nothing.
14. Browser: with OPFS removed, the app shows the "cannot store projects" screen.
15. Browser: the library and project screens have no axe violations.

## Performance budgets

- Contributes to "open project to an editable cursor": from navigation to `openProject` resolved (tree in memory) at most 500 ms on the fixture at four times CPU slowdown in Chromium. Package 05 proves the full budget.
- `ProjectStore` methods that read (`children`, `manuscript`, `indexOf`) do no work proportional to the tree after the first call following a change; the unit test asserts `manuscript()` returns the same array until `version()` changes.

## Accessibility and mobile

The library is a list of buttons with an actions menu per project; all actions work by keyboard and by touch. The save indicator is a polite live region that announces changes of state, not every save. Regions collapse to sheets under 720 CSS px.

## Out of scope

The editor, the tree interface, and every feature component (stubs only). Undo of structure commands.

## Dependencies

Packages 00 and 01. Package 03 for the browser tests; unit work can proceed against the memory client while 03 is in progress.
