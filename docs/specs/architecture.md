# Architecture for Phase 1

This file records the decisions every Phase 1 work package depends on. Each decision gives its reason and the alternative that was rejected. The work package specs in this directory refer to it by section number and do not repeat it.

Sources: `docs/PLAN.md` (the plan), `docs/spikes/results/A.md`, `B.md` and `C.md` (the spike findings, cited as Spike A, B and C), and `docs/research/`.

All spike measurements come from headless desktop browsers on one small arm64 host. **No real phone has been tested.** Section 17 lists what is provisional and names the one module that would change for each item.

## 1. Terms

Each term is defined here once and used with this meaning in every spec.

- **Project**: one book or story. It has its own database and can be exported as one backup file.
- **Node**: an entry in the project tree. A node is a **folder** or a **scene**.
- **Scene**: a leaf node that holds text. One scene is one stored document and one editor.
- **Manuscript order**: the live (not trashed) scenes in depth-first tree order. It is the reading order.
- **Composite view**: all scenes shown in manuscript order as one continuous scrolling text.
- **Pane**: one instance of the composite view on screen. Phase 1 has one pane, or two in split view.
- **Slot**: the DOM element that stands for one scene inside a pane. It contains either a mounted editor or nothing but a height.
- **Mounted**: a scene is mounted in a pane when its slot contains a live ProseMirror editor.
- **Position**: a place in the manuscript, written `{ sceneId, offset }`, where `offset` counts UTF-16 code units in the scene's plain text (section 4.4).
- **Update**: the bytes Yjs emits for one change to a scene's document.
- **Update log**: the stored updates of a scene that have not yet been folded into its stored state.
- **Compaction**: folding a scene's update log into its stored state.
- **Storage worker**: the Web Worker that owns a project's database. Nothing else touches the database.
- **Build**: the output of one production build of the app. Every build has a **build id**.
- **Phone budget** and **desktop budget**: the two columns of the performance table in `docs/PLAN.md` section 6.

## 2. Platform baseline

| Decision | Reason | Rejected |
|---|---|---|
| The app supports Safari and iOS 17 or later and the current versions of Chrome, Edge and Firefox. Continuous integration tests Chromium and WebKit. | Everything the design needs exists there: OPFS synchronous access handles, Web Locks, `<dialog>`, the `popover` attribute, regular-expression lookbehind, `visualViewport`. | Supporting older Safari would need a second storage path. |
| The app needs a secure context (HTTPS or `localhost`) and OPFS. Where OPFS is missing (Safari private browsing), the app shows a full-screen notice that says why it cannot store projects and does nothing else. | One storage path. Spike B confirmed OPFS is absent in Safari private mode. | A fallback to IndexedDB: a second storage layer to test, and the research found it degrades past about 100 MB. |
| No cross-origin isolation headers (`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`) and no `SharedArrayBuffer`. | Spike B: the storage layers that need the headers failed on write latency (111 to 155 ms against 20 ms) and start-up; the chosen layer does not need them. Any static host can therefore serve the app. | The official `opfs` layer. |
| No server. The app is static files. | Local-first is a product decision (PLAN section 2). | Any hosted component. |

## 3. Repository and module layout

One package at the repository root, built with Vite. There are no workspaces: every module is consumed only by this app, and one `package.json` keeps install, type checking and builds single-step.

```
index.html
package.json  bun.lock  vite.config.ts  tsconfig.json  biome.json
public/                 manifest.webmanifest, icons, 404.html, _headers
scripts/                build-sw.ts, ci-plan.sh
src/
  main.tsx              entry: starts storage, renders the app
  model/                pure domain code: schema, plain text, ids, order keys, types
  storage/
    protocol.ts         message and error types shared by both sides
    client.ts           main-thread side of the protocol
    worker/             the storage worker (section 6)
  project/              ProjectStore, SceneStore, UndoCoordinator, Navigator
  editor/               the windowing layer and everything inside a pane
  features/<name>/      one directory per user-facing feature
  app/                  screens, layout regions, error boundary
  ui/                   shared presentational pieces: dialog, sheet, toast, panels, tokens.css
  i18n/                 message catalogue and t()
  platform/             the browser behind small functions: lifecycle, shortcuts, keyboard, env, saving files
  sw/                   service worker and the page side of updates
tests/
  e2e/                  Playwright tests
  perf/                 budget tests, fixture generator, budgets.ts
spikes/                 frozen spike code; never imported
```

Unit tests sit next to the code they test as `*.test.ts`.

**Import rule.** A directory may import only from directories earlier in this list: `model`, `platform`, `i18n`, `ui`, `storage`, `project`, `editor`, `features`, `app`. A feature never imports another feature; features meet through `project/` and the editor contract. `sw/` imports only from `platform`. The rule is checked in CI by `scripts/check-imports.ts`, which reads import statements and fails on a violation. Reason: the rule is what lets packages be built at the same time. Rejected: a monorepo with one package per module (more configuration, no extra safety over the script).

**Tools.** TypeScript in strict mode; React 19; Vite; Bun as package manager, script runner and unit test runner; Biome for lint and format; Playwright for browser tests. Package 00 pins versions in `bun.lock`, starting from the versions the spikes measured (ProseMirror view 1.42, Yjs 13.6, `@sqlite.org/sqlite-wasm` 3.54, Playwright 1.64).

**Runtime dependencies allowed in Phase 1**, all compatible with AGPL-3.0:

| Package | Licence | Used by |
|---|---|---|
| react, react-dom | MIT | app |
| prosemirror-model, -state, -view, -transform, -keymap, -commands | MIT | model, editor |
| yjs | MIT | project, storage worker |
| y-prosemirror 1.x | MIT | editor, storage worker |
| @sqlite.org/sqlite-wasm | Apache-2.0; SQLite is public domain | storage worker |
| fractional-indexing | CC0-1.0 | model (order keys) |
| diff | BSD-3-Clause | snapshots (compare) |
| docx | MIT | DOCX export, loaded on demand |
| mammoth | BSD-2-Clause | DOCX import, loaded on demand |
| marked | MIT | Markdown import, loaded on demand |

Adding a runtime dependency that is not in this table needs a change to this file in the same pull request.

## 4. Document model

### 4.1 Format profile

A **format profile** is one object that tells the editor what a document may contain:

```ts
// model/profile.ts
export interface FormatProfile {
  id: 'prose'                       // 'screenplay' joins this union in Phase 2
  schema: Schema                    // ProseMirror schema for one scene
  keymap: Record<string, Command>   // what Enter, Tab and similar keys do
  blockCommands: BlockCommand[]     // block types the toolbar offers
  estimateHeight(stats: SceneStats, layout: PaneLayout): number  // for unmounted slots
}
```

The project's profile id is stored in the project (section 5). The editor, the stores and the exporters receive the profile as a parameter and never import the prose schema directly. Reason: this is the one place a screenplay profile plugs in later. Rejected: importing `proseSchema` wherever it is needed, which would make Phase 2 a search-and-replace across the editor.

Phase 1 ships one profile, `prose`:

- Block nodes: `paragraph`; `heading` with `level` 1 to 3; `blockquote` containing one or more paragraphs; `scene_break`, a leaf block.
- A scene document is `block+`. A scene is never empty: an empty scene holds one empty paragraph.
- Marks: `em`, `strong`, `underline`, `strike`, `provenance` (section 4.3).
- There is no hard line break inside a paragraph in Phase 1. Imported line breaks become paragraph breaks.

### 4.2 Project tree

A project is a tree of nodes. A folder contains folders and scenes; a scene contains text. Each node has a stable id (a UUID from `crypto.randomUUID()`), a parent, an order key, a title, a synopsis, a status, labels, and cached statistics.

- **Order keys** are fractional-index strings: a key can always be generated between two neighbours, so a move rewrites one row. Reason: reordering must not renumber siblings (PLAN section 4). Rejected: integer positions.
- **Status** is one of `none`, `todo`, `draft`, `revised`, `done`. The list is fixed.
- **Labels** are free-text strings.
- **Trash.** Deleting a node sets `trashed_at` on it. A trashed node and everything below it leave the manuscript order and appear in the Trash view, from which they can be restored or deleted for good.
- **What a folder means on export** is decided by structure, not by a folder type: a folder that directly contains scenes is a chapter; a folder that contains folders is a part. Scenes at the top level form a story without chapters.

Text never crosses a scene boundary through ordinary typing. Scenes are created, split, merged and removed only by explicit commands. Reason: every keystroke then changes exactly one stored document, which keeps undo, storage and later sync simple. Rejected: letting Backspace at the start of a scene join it to the previous scene, which Spike A built; it turns one key into an edit of two documents.

### 4.3 Provenance marks

Every span of text has an origin. The data model carries this from Phase 1 so that the AI phase adds behaviour but migrates no stored text.

- `typed` is the default and stores nothing: text without a `provenance` mark is typed.
- `ai` is text inserted from a model's output and not changed since.
- `ai-edited` is text that began as `ai` and was then edited.

The mark:

```ts
provenance: {
  attrs: { origin: {} /* 'ai' | 'ai-edited' */, gen: {} /* generation id, a UUID */ },
  inclusive: false,   // typing at either edge of a span is typed text
  excludes: 'provenance',
}
```

Rules, enforced by a ProseMirror plugin in `model/provenance.ts` that every scene editor loads:

1. A change made inside an `ai` span (text inserted strictly inside it, or part of it deleted) turns the whole contiguous span with that `gen` into `ai-edited`. Text inserted inside the span takes the span's mark.
2. An `ai` or `ai-edited` span never becomes `typed`. Only deleting the text removes the mark.
3. Formatting changes (italic and the like) do not change the origin.
4. Copy and paste inside the app keeps the mark. Text pasted from outside the app is `typed`; the app cannot verify it, which PLAN section 4 already records.
5. Imported text is `typed`.

Nothing in Phase 1 creates an `ai` span. The rules are implemented and tested now because the editing code written in Phase 1 (cross-scene delete, paste, snapshot restore) must preserve marks, and the tests are the only way to hold it to that. The generation record table (model, provider, date, prompt, cost) is added in the AI phase by an additive migration; no existing row or document changes.

### 4.4 Plain text and positions

Several modules need to agree on what "the text of a scene" is: search, find highlights, bookmarks, the last caret position, word counts. One function defines it.

`plainText(doc)` in `model/text.ts`: take the text blocks (paragraphs and headings, including paragraphs inside block quotes) in document order; each contributes its text; a `scene_break` contributes an empty string; join with `"\n"`.

- A **position** is `{ sceneId, offset }` where `offset` is a UTF-16 code unit offset into that string.
- `posAtOffset(doc, offset)` and `offsetAtPos(doc, pos)` convert between offsets and ProseMirror positions. An offset that falls on a `"\n"` maps to the end of the block before it.
- `countWords(text)` is the number of matches of `/\S+/g`. This under-counts languages written without spaces; see section 16.

Positions are not stable under edits made elsewhere in the same scene. That is accepted for the last caret position, history and bookmarks, which clamp to the scene's length. Rejected for Phase 1: Yjs relative positions, which are stable but need the document loaded to resolve.

### 4.5 Scene documents in Yjs

Each scene is one `Y.Doc`. It has exactly one shared type, a `Y.XmlFragment` named `body`, in the layout the y-prosemirror binding writes: a block node is a `Y.XmlElement` named after the node type with its attributes; text is a `Y.XmlText` whose formatting attributes are the marks.

Reason for one document per scene: storage, snapshots and loading work on small units, and two devices that edit different scenes can never conflict (Spike B measured it; PLAN section 5). Rejected: one document for the project, which must be loaded whole.

Reason for Yjs 13 with y-prosemirror 1.x: both are stable releases and Yjs met every threshold in Spike B. Rejected: Yjs 14 and its new binding (pre-release); Loro (not needed, so not evaluated).

Node titles, the tree and other metadata are not in Yjs. They are rows in SQLite. How they sync is a Phase 5 question.

**Not yet measured together.** Spike A measured editors without Yjs and Spike B measured Yjs without editors. Package 05 is the first code that binds a ProseMirror editor to a `Y.Doc`, and its budget tests are the first measurement of that combination.

### 4.6 Snapshots

A snapshot is a stored copy of one scene's state at one moment: the output of `Y.encodeStateAsUpdate` plus a kind, an optional name, a time and a word count.

- **Kinds:** `manual` (the writer asked), `auto` (taken by the rule below), `pre-restore` (the state just before a restore), `pre-merge` (each scene just before a merge).
- **Automatic rule:** when a scene receives its first update after being opened, and its newest snapshot is older than 30 minutes or does not exist, the storage worker first stores a snapshot of the state as it was before that update. A scene with no words is skipped, and so is a state identical to the newest snapshot. This keeps "how the scene looked before this sitting".
- **Retention:** manual snapshots are kept until deleted. Of the other kinds, the newest 30 per scene are kept.
- **Restore** writes the snapshot's content into the current document as one new change. It does not replace the stored state. Reason: the restore is then an ordinary edit, so it can be undone, the mounted editor updates without being rebuilt, and the document stays valid for sync later. Cost, from Spike B: 17 to 30 ms for a typical scene and 78 to 182 ms for a 10,000-word scene, which exceeds the 100 ms budget for that one case; PLAN section 6 is adjusted to say so. Rejected: replacing the stored state, which is faster (6 ms) but throws away undo history and is wrong for any document that is ever synced.

## 5. Database schema

One SQLite database per project. Schema version 1 contains every table Phase 1 needs, so that packages built at the same time do not each add a migration.

```sql
PRAGMA user_version = 1;
PRAGMA foreign_keys = ON;   -- set on every open

CREATE TABLE meta (key TEXT PRIMARY KEY, value) WITHOUT ROWID;

CREATE TABLE node (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT REFERENCES node(id) ON DELETE CASCADE,  -- NULL at the top level
  ord         TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('folder','scene')),
  title       TEXT NOT NULL DEFAULT '',
  synopsis    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'none'
              CHECK (status IN ('none','todo','draft','revised','done')),
  labels      TEXT NOT NULL DEFAULT '[]',    -- JSON array of strings
  words       INTEGER NOT NULL DEFAULT 0,    -- scenes only; as of the last compaction
  chars       INTEGER NOT NULL DEFAULT 0,    -- length of the plain text
  blocks      INTEGER NOT NULL DEFAULT 1,    -- number of top-level blocks
  created_at  INTEGER NOT NULL,              -- milliseconds since the epoch, everywhere
  updated_at  INTEGER NOT NULL,
  trashed_at  INTEGER
) WITHOUT ROWID;
CREATE INDEX node_parent ON node(parent_id, ord);

CREATE TABLE doc_state (
  scene_id TEXT PRIMARY KEY REFERENCES node(id) ON DELETE CASCADE,
  seq      INTEGER NOT NULL,     -- sequence number of the last update folded in
  state    BLOB NOT NULL         -- Y.encodeStateAsUpdate
) WITHOUT ROWID;

CREATE TABLE doc_update (
  scene_id TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  seq      INTEGER NOT NULL,
  at       INTEGER NOT NULL,
  bytes    BLOB NOT NULL,
  PRIMARY KEY (scene_id, seq)
) WITHOUT ROWID;

CREATE TABLE doc_text (
  id       INTEGER PRIMARY KEY,
  scene_id TEXT NOT NULL UNIQUE REFERENCES node(id) ON DELETE CASCADE,
  body     TEXT NOT NULL         -- plainText() of doc_state.state
);

CREATE TABLE snapshot (
  id         TEXT PRIMARY KEY,
  scene_id   TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('manual','auto','pre-restore','pre-merge')),
  name       TEXT,
  words      INTEGER NOT NULL,
  state      BLOB NOT NULL
) WITHOUT ROWID;
CREATE INDEX snapshot_scene ON snapshot(scene_id, created_at);

CREATE TABLE bookmark (
  id         TEXT PRIMARY KEY,
  scene_id   TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  offset     INTEGER NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE daily_words (
  day         TEXT PRIMARY KEY,   -- local date, YYYY-MM-DD
  start_words INTEGER NOT NULL,   -- manuscript total when the day's first change arrived
  end_words   INTEGER NOT NULL    -- manuscript total at the latest compaction that day
) WITHOUT ROWID;
```

`meta` keys in version 1: `format` (always `fjader-project`), `project_id`, `title`, `profile` (`prose`), `lang` (a BCP 47 tag), `created_at`, `last_position` (JSON `{ sceneId, offset }`), `last_backup_at`, `changed_since_backup` (0 or 1), `target_words`, `target_daily`, `manuscript` (JSON with the author details the DOCX export needs).

Decisions in this schema:

| Decision | Reason | Rejected |
|---|---|---|
| One database file per project. | A backup is then one file that already exists; deleting a project is deleting a directory; the lock that prevents two tabs from opening the same database is per project (section 6.2). | One database for all projects, which makes backup an extraction and makes the single-connection limit app-wide. |
| Stored state and update log are separate tables. | Appending a 12-byte update must not rewrite a scene's state. Spike B measured this shape. | One row per scene rewritten on every change. |
| `doc_text` keeps the plain text of each scene beside its Yjs state. | Search and find scan it (section 9); word counts come from it. It costs 2.1 MB for 300,000 words (Spike B). | Decoding Yjs states at query time. |
| No full-text index. | See section 9. | FTS5 word and trigram indexes. |
| `chars` and `blocks` on `node`. | The windowing layer estimates the height of a scene it has never mounted from these two numbers, without loading the text. | Loading every scene to measure it. |

**Migrations.** `PRAGMA user_version` is the schema version. Migrations are numbered modules in `src/storage/worker/migrations/`, each a function that receives the database; the worker runs the missing ones in order, each in its own transaction, when it opens a project. Migrations only go forward. Before migrating a database that already holds data, the worker writes a copy of the database file next to it (section 6.1) and keeps the most recent such copy. A database whose version is higher than the app knows is not opened: the worker reports `newer-schema` and the app offers to download the file unchanged. Reason: an older build can meet a newer database after a rollback or on a device that has not updated.

## 6. Storage worker

### 6.1 Files

Everything is in the Origin Private File System under one root directory:

```
fjader/
  projects/
    <projectId>/
      info.json               { id, title, words, updatedAt, schemaVersion }
      db/                     directory owned by the SQLite storage layer
      pre-migration.fjader    copy of the database before the last migration, if any
```

`info.json` exists so that the list of projects can be shown without opening any database: the main thread lists `projects/` and reads each `info.json`. The storage worker rewrites it when the project is opened, renamed, flushed on hide, and closed. Rejected: a shared index database, which the storage layer cannot open from two tabs at once.

### 6.2 SQLite configuration

As recommended by Spike B:

- The official SQLite WASM build with the `opfs-sahpool` storage layer, installed on `projects/<projectId>/db/` with a storage-layer name unique to the project. One connection, in one dedicated worker per open project.
- Pragmas on open: `locking_mode=exclusive`, `journal_mode=wal`, `synchronous=normal`, `wal_autocheckpoint=128`, `journal_size_limit=1048576`, `foreign_keys=on`.
- `PRAGMA wal_checkpoint(TRUNCATE)` after bulk writes (import, `VACUUM`), before a backup export, and on close.
- `VACUUM` runs only after nodes are deleted for good, and only when the free pages exceed 5 MB.

Reasons, from Spike B: write batches take 0.3 to 0.5 ms at the median against 4 to 5 ms for the alternative layer, because a single connection allows write-ahead logging; it is the SQLite project's own build; 128 kills produced no corruption and lost at most 300 ms of typing. The pragmas that bound the write-ahead log are there because without them a 15 MB import left a 26 MB log file that never shrank. Rejected: wa-sqlite's `OPFSCoopSyncVFS`, which also passed but needs a custom build to get the features we use and writes ten times slower; the official `opfs` and `opfs-wl` layers, which failed.

**One tab per project.** Before installing the storage layer, the worker takes an exclusive Web Lock named `fjader:project:<projectId>` and holds it for its lifetime. A second tab that opens the same project cannot get the lock; its worker reports `lock-waiting`, the tab shows "This project is open in another tab or window", and it takes over by itself when the first tab closes the project (Spike B measured 100 to 300 ms). Two tabs can have two different projects open. Rejected: letting the second tab read while it waits, which would need the first tab to answer its queries.

**Isolation.** `src/storage/worker/sqlite.ts` is the only file that imports the SQLite package or names the storage layer. It exports `openDatabase(projectId)` and returns this interface, which the rest of the worker uses:

```ts
export interface Db {
  exec(sql: string): Promise<void>
  run(sql: string, params?: SqlValue[]): Promise<void>
  all(sql: string, params?: SqlValue[]): Promise<SqlValue[][]>
  transaction<T>(fn: () => Promise<T>): Promise<T>
  exportFile(): Promise<Uint8Array>
  close(): Promise<void>
}
```

The methods return promises although the chosen layer is synchronous, so that an asynchronous layer could replace it. Unit tests run the worker's logic against the same interface implemented over Bun's built-in SQLite; browser tests run it against the real layer.

### 6.3 Protocol

The main thread talks to the worker through `StorageClient` (`src/storage/client.ts`). There are three kinds of message: requests that get exactly one response, one-way notifications from the main thread, and events from the worker. All types are in `src/storage/protocol.ts`, written by package 01. The worker serialises all database work: a request never interleaves with a write batch.

```ts
export type StorageErrorCode =
  | 'unavailable'      // no OPFS, or the worker failed to start
  | 'quota'            // out of space
  | 'corrupt'          // SQLite reports a damaged or foreign file
  | 'newer-schema'     // written by a newer version of the app
  | 'migration-failed'
  | 'io'               // any other storage failure
  | 'not-found'
  | 'invalid'          // bad arguments, including an invalid search pattern
  | 'not-implemented'  // the handler has not been built yet

export interface StorageError { code: StorageErrorCode; message: string }

export interface StorageClient {
  // lifecycle
  open(p: { projectId: ProjectId; create?: NewProject; importFrom?: Uint8Array }): Promise<ProjectMeta>
  flush(): Promise<void>                 // resolves when every queued update is committed
  close(): Promise<void>                 // flush, compact, checkpoint, close, release the lock
  on(listener: (e: StorageEvent) => void): () => void

  // tree
  loadTree(): Promise<NodeRow[]>         // live and trashed nodes
  createNodes(nodes: NewNode[]): Promise<void>            // one transaction
  updateNode(id: NodeId, patch: NodePatch): Promise<void> // title, synopsis, status, labels
  moveNode(id: NodeId, parentId: NodeId | null, ord: string): Promise<void>
  trashNode(id: NodeId): Promise<void>
  restoreNode(id: NodeId): Promise<void>
  purgeNodes(ids: NodeId[]): Promise<void>                // deletes for good, with documents

  // documents
  openDocs(sceneIds: SceneId[]): Promise<StoredDoc[]>     // buffers are transferred
  appendUpdate(sceneId: SceneId, seq: number, bytes: Uint8Array): void   // notification
  closeDoc(sceneId: SceneId): void                                       // notification

  // search (package 09)
  search(q: SearchQuery, limit: number): Promise<SearchResult>
  searchScene(q: SearchQuery, sceneId: SceneId): Promise<TextRange[]>
  allText(): Promise<{ sceneId: SceneId; body: string }[]>   // manuscript order

  // snapshots (package 11)
  createSnapshot(sceneId: SceneId, kind: SnapshotKind, name?: string): Promise<SnapshotMeta>
  listSnapshots(sceneId: SceneId): Promise<SnapshotMeta[]>
  getSnapshot(id: SnapshotId): Promise<{ meta: SnapshotMeta; state: Uint8Array }>
  renameSnapshot(id: SnapshotId, name: string): Promise<void>
  deleteSnapshot(id: SnapshotId): Promise<void>

  // bookmarks (package 10)
  listBookmarks(): Promise<Bookmark[]>
  putBookmark(b: Bookmark): Promise<void>
  deleteBookmark(id: string): Promise<void>

  // project settings and counters
  getMeta(): Promise<ProjectMeta>
  setMeta(patch: Partial<ProjectMeta>): Promise<void>
  wordsToday(): Promise<{ day: string; startWords: number; endWords: number }>   // package 12

  // backup and diagnostics (package 13)
  exportBackup(): Promise<Uint8Array>
  stats(): Promise<{ bytes: number; freeBytes: number; schemaVersion: number; sqliteVersion: string }>
  check(): Promise<{ ok: boolean; detail: string }>
}

export interface StoredDoc { sceneId: SceneId; state: Uint8Array; updates: Uint8Array[]; lastSeq: number }
export interface NewNode extends NodeRow { state?: Uint8Array }   // state: initial document of a scene

export type StorageEvent =
  | { type: 'lock-waiting' }
  | { type: 'durable'; sceneId: SceneId; seq: number }          // every update up to seq is committed
  | { type: 'write-error'; error: StorageError; attempts: number }
  | { type: 'scene-stats'; sceneId: SceneId; words: number; chars: number; blocks: number }
```

`NodeRow`, `ProjectMeta`, `NewProject`, `SearchQuery`, `SearchResult`, `TextRange`, `SnapshotMeta` and `Bookmark` are written out in the spec of package 01 and live in `model/types.ts` or `storage/protocol.ts`.

Package 03 implements lifecycle, tree, documents and project settings. Every other handler exists from package 03 on as a stub in its own file under `src/storage/worker/handlers/` that rejects with `not-implemented`; the package that owns the feature replaces the stub. Reason: packages that add storage features then edit different files.

### 6.4 The write path

1. The main thread gives each update of a scene the next sequence number, starting at `lastSeq + 1`, and posts it to the worker at once with `appendUpdate`. It keeps the update in memory until the worker reports it durable.
2. The worker queues updates and commits the queue in one transaction **250 ms after the first queued update arrived**. Inserts use `INSERT OR IGNORE`, so a re-sent update is harmless.
3. After the commit, the worker emits `durable` for each scene in the batch.
4. The main thread calls `flush()` when the page becomes hidden (`visibilitychange` to `hidden`, and `pagehide`). The worker commits at once, then compacts scenes with a non-empty log, then rewrites `info.json`.
5. If a commit fails, the worker keeps the batch, emits `write-error`, and retries every 250 ms. After three failures the main thread restarts the worker, reopens the project and sends every update it still holds again. If that fails too, the app shows the storage error screen (section 12).

Measured in Spike B with these settings: a change is durable 251 to 257 ms after it is made at the 95th percentile, 314 ms at worst; a kill loses at most 300 ms of typing against a budget of one second. Rejected: 500 ms batches (already at the limit of the "written within 500 ms" requirement); committing every change (no measurable cost on this layer, but more flash writes).

Step 5's restart also covers the risk Spike B could not test: a storage handle that no longer works after a phone has suspended the app for a long time.

### 6.5 Compaction

The worker compacts a scene (folds its update log into `doc_state`) when any of these holds:

- its log reaches **200 updates or 32 KB**;
- the main thread closes the scene (`closeDoc`);
- the page becomes hidden;
- a search, snapshot or backup is about to read it and its log is not empty.

Compaction loads state and log into a `Y.Doc` and re-encodes it. In the same transaction it rewrites the scene's `doc_text` row, updates `words`, `chars` and `blocks` on the node, and updates today's `daily_words` row. It then emits `scene-stats`.

Reasons, from Spike B: a document with 500 logged updates took up to 75 ms to load in WebKit against a 50 ms budget, and 2 to 15 ms with 100; `Y.mergeUpdates` was slower beyond about 500 updates and left states 30 to 70 percent larger than re-encoding. The fourth trigger is what keeps search results current without a second copy of the text: anything that reads `doc_text` first brings it up to date. Only scenes being edited have a log, so this is normally one or two compactions of at most 200 updates, about 14 ms each for a typical scene in Spike B.

## 7. State on the main thread

| Decision | Reason | Rejected |
|---|---|---|
| Domain state lives in plain TypeScript classes in `src/project/`. Each exposes `subscribe(listener)` and `getSnapshot()`; React components read them with `useSyncExternalStore`. | The state that matters (tree, documents, undo) is owned by storage and Yjs, not by React. Classes can be unit-tested without a DOM. | A state library (Redux, Zustand): a dependency that adds nothing these two methods lack. |
| Transient interface state (open panels, dialog contents) is React component state. | It has no life outside the component. | Putting it in the stores. |
| ProseMirror editors are created and destroyed imperatively by the windowing layer. React renders the pane's container and nothing inside it. | Mounting must happen inside a scroll event, before paint (Spike A). React's scheduling cannot promise that. | A React binding for ProseMirror. |
| Routing is the URL fragment: `#/` is the library, `#/p/<projectId>` is a project. On launch with no fragment, the app opens the project named in `localStorage` key `fjader.lastProject`. | The app has two screens. A fragment works on any static host without rewrite rules. | A router library; path-based routes, which need server configuration. |

The four stores, created when a project opens and destroyed when it closes:

**ProjectStore** holds the tree. It loads all node rows once, applies each tree operation to memory first and then calls the storage client, and reloads the tree if a call fails. It overlays live statistics for scenes being edited on the cached ones from the database.

**SceneStore** owns the `Y.Doc` of every loaded scene.

```ts
export interface SceneStore {
  prefetch(sceneIds: SceneId[]): void                 // fetch stored bytes ahead of need
  has(sceneId: SceneId): boolean                      // bytes or document already in memory
  acquire(sceneId: SceneId): Promise<SceneDoc>        // counted; pair with release
  acquireNow(sceneId: SceneId): SceneDoc | null       // only when has() is true
  release(sceneId: SceneId): void
  apply(sceneId: SceneId, origin: EditOrigin, edit: (doc: PMNode) => Transform): Promise<void>
  saveState(): 'saved' | 'saving' | 'error'           // with subscribe()
}
export interface SceneDoc { sceneId: SceneId; ydoc: Y.Doc; body: Y.XmlFragment; undo: Y.UndoManager }
export type EditOrigin = 'edit' | 'structure'
```

- `apply` changes a scene whether or not it is mounted. When the scene is mounted in a pane the change is dispatched to that editor; otherwise it is written to the `Y.Doc` through the binding's document-diff function. Package 04 must confirm that function behaves; the fallback is a temporary editor on a detached element.
- Origin `edit` is a change the writer can undo. Origin `structure` is a text move made by split or merge and is not put on the undo stack (section 8.5).
- A scene's `Y.Doc` stays in memory while it is mounted, while it has undo history, and while it has updates that are not yet durable. Otherwise it is destroyed on `release` and the worker is told with `closeDoc`.
- `saveState()` is `saving` while any update awaits its `durable` event and `error` after a `write-error`.

**UndoCoordinator** gives the project one undo history (section 8.5).

**Navigator** holds the current position, the history of earlier positions, and the request to go somewhere:

```ts
export interface Navigator {
  current(): Position | null
  report(paneId: string, pos: Position): void    // called by a pane when its caret moves
  goTo(pos: Position, opts?: { select?: { from: Position; to: Position } }): void
  back(): void
  forward(): void
  canGoBack(): boolean
  canGoForward(): boolean
  onGo(listener: (pos: Position, opts?: GoOptions) => void): () => void   // panes listen
}
```

Features call `goTo`; they never call a pane. `goTo` records the position being left in the history (50 entries). The Navigator stores the current position in `meta.last_position` two seconds after it last changed and when the page becomes hidden.

## 8. Editor windowing layer

The decision, from Spike A: **one ProseMirror editor per scene, with only the scenes near the viewport mounted.** A single editor for the whole project failed the typing budget in Chromium (95th percentile 32 to 34 ms unthrottled, 157 to 182 ms at four times CPU slowdown, against 7 to 8 ms for per-scene editors) because the browser's own editing code slows with the size of the editable region. A single editor with `content-visibility` passed in Chromium but in WebKit inserted typed text in the wrong chapter and jumped 28 px during scrolling. Per-scene editors passed every budget in both engines unthrottled; the price is that everything which crosses a scene boundary is ours to build.

The layer lives in `src/editor/` and is used through one function:

```ts
export function createEditorPane(host: HTMLElement, deps: {
  paneId: string
  profile: FormatProfile
  project: ProjectStore
  scenes: SceneStore
  undo: UndoCoordinator
  navigator: Navigator
}): EditorPane

export interface EditorPane {
  jumpTo(pos: Position, opts?: GoOptions): Promise<void>
  selection(): ProjectSelection | null
  setSelection(sel: ProjectSelection): void
  setDecorations(source: string, className: string, ranges: ReadonlyMap<SceneId, readonly TextRange[]>): void
  run(command: EditorCommand): boolean
  formatState(): FormatState
  focus(): void
  subscribe(listener: (e: EditorEvent) => void): () => void
  destroy(): void
}
export interface ProjectSelection { anchor: Position; head: Position }
export interface TextRange { start: number; end: number }   // offsets in one scene's plain text
```

### 8.1 Mounting window

- The pane contains, in manuscript order, a heading for each folder and one slot for each scene.
- Scenes within **two viewport heights** above and below the viewport are mounted. A scene that intersects the viewport is mounted inside the scroll event, before the frame is painted. Scenes in the two-viewport margin are mounted one per animation frame, nearest first.
- A scene outside the window is unmounted and its slot keeps the height it had.
- A scene that has never been mounted has an estimated height from `profile.estimateHeight` using the node's `chars` and `blocks`. Measured heights are remembered for the session and discarded when the pane's width changes.
- These scenes are never unmounted: the scene with the caret; a scene with an active input-method composition; a scene with focus; both ends of a cross-scene selection.
- The pane asks the SceneStore to prefetch stored bytes for scenes within **six viewport heights**, so that mounting a scene that scrolls into view does not wait for the worker. If a scene enters the viewport before its bytes arrive, its slot stays empty until they do; the budget is that this never lasts 100 ms.
- The editor state is created from the `Y.Doc` in the same task as the mount (y-prosemirror's `initProseMirrorDoc`), not one task later.

Spike A measured 840 DOM elements with this window against 6,861 for the whole project, and jumps to any scene in at most 27 ms unthrottled.

### 8.2 Scroll anchoring

Whenever slots above the viewport change height (a mount replaces an estimate, an unmount, a width change), the text on screen must not move: the budget is a shift of at most 1 px.

All of this is in one file, `src/editor/windowing/anchor.ts`, with one function that the rest of the layer calls around every change:

```ts
export function keepAnchor(scroller: HTMLElement, change: () => void): void
```

Phase 1 implements it as Spike A did: browser scroll anchoring is switched off (`overflow-anchor: none`); the function records the viewport offset of a slot that is not changing, runs the change, and corrects `scrollTop` by the difference in the same task. Spike A measured 0.00 px of shift in every run, including real touch flicks in Chromium.

This is the most likely thing to fail on a real iPhone, because writing `scrollTop` during a momentum scroll has historically stopped the scroll. Until the phone check is done, the build accepts `?anchor=native` in the URL, which makes `keepAnchor` run the change and leave the correction to the browser's own scroll anchoring (also 0.00 px in Spike A's automated runs). Section 17 says what follows from each outcome. The query parameter is removed when the check is closed.

### 8.3 Movement and selection across scenes

Inside one scene, the caret and the selection are the browser's own. Across scenes:

- **Keys.** Left and Right at a scene's edge, Up and Down on its first or last line (keeping the horizontal position), word and line movement, Page Up and Page Down, and start and end of document all move the caret into the neighbouring scene. Backspace at the very start of a scene and Delete at the very end move the caret across the boundary and delete nothing.
- **Selection.** A browser will not extend a selection out of the editor it began in (Spike A confirmed it). When a selection crosses a boundary, the pane keeps it as a `ProjectSelection` and draws it with decorations in each mounted scene. Dragging with a mouse, Shift with arrow keys and Shift with a click extend it; dragging near the top or bottom edge scrolls.
- **Editing a cross-scene selection** goes through `SceneStore.apply` for each scene it touches: delete, type over, cut, paste over, and toggle a mark. Text is removed from each scene; no scene is removed, and the two ends are not joined. The caret ends at the start of the removed range.
- **Copy** reads the text from the documents, not from the DOM, so it works for scenes that are not mounted. Select All selects the scene on first use and the whole manuscript on the second.
- **Touch.** The system's selection handles stop at the scene boundary, and Phase 1 accepts that: on touch devices a selection made with the handles stays inside one scene. "Select scene" and "Select all" are offered in the selection menu. This is an open decision (see `README.md`).

### 8.4 Decorations from outside

`setDecorations(source, className, ranges)` replaces all highlights owned by `source`. The pane turns each `TextRange` into an inline decoration when the scene is mounted and re-applies it when the scene mounts later. Find uses it for matches. It is also where live page breaks will arrive in Phase 2 (section 10).

### 8.5 Undo

Each scene's `Y.Doc` has its own `Y.UndoManager`. The writer sees one history:

- **Undo is chronological across the project.** Undo reverts the most recent change wherever it is, scrolls it into view, and puts the caret there. Redo does the reverse. A new change clears the redo history.
- **A change that touches several scenes is one step.** Deleting a cross-scene selection is undone by one Undo.
- **Typing is grouped** as the undo manager groups it: changes less than 500 ms apart in one scene are one step.
- **Structure commands are not undo steps.** Creating, moving, renaming, trashing, splitting and merging are reversed by their opposite command or from the Trash. A merge takes a `pre-merge` snapshot of both scenes first. Text moved by split or merge uses origin `structure`, which the undo managers do not track, so a later Undo cannot bring moved text back a second time.
- The history lives in memory and ends when the project is closed.

```ts
export interface UndoCoordinator {
  undo(): Promise<Position | null>     // the place that changed, for the pane to reveal
  redo(): Promise<Position | null>
  canUndo(): boolean
  canRedo(): boolean
  group<T>(fn: () => T): T             // every step recorded during fn becomes one step
  subscribe(listener: () => void): () => void
}
```

The coordinator keeps a stack of entries, each a list of scene ids. It listens to every loaded scene's undo manager; when a manager records a step, the coordinator pushes an entry for that scene, or adds the scene to the open group. Undo pops an entry and calls `undo()` on each scene's manager. An entry whose scene is no longer in the manuscript is dropped.

Rejected: per-scene undo as the user-facing behaviour (Spike A found one Undo did not revert a cross-scene edit, and a writer does not think in scenes when pressing Undo); one `Y.Doc` for the project to get one history (gives up scene-sized storage).

### 8.6 Find

The browser's find-in-page sees only mounted scenes: 3,832 of 300,000 words in Spike A's check. The app therefore handles the find shortcut itself and searches stored text (section 9). Safari's "Find on Page" in the share sheet cannot be intercepted and will find only what is mounted; that is a known limit.

## 9. Search

**Decision: search and find scan the plain text of every scene in the storage worker. There is no full-text index.**

- A text query is matched as a literal string, case-insensitive unless the writer asks otherwise, with an optional whole-word restriction. A phrase is simply a longer string.
- A regular-expression query is matched by the JavaScript engine.
- Results are listed in manuscript order.

Reasons, from Spike B: scanning all 300,000 words takes 7 to 16 ms for a substring and 8 to 18 ms for a regular expression at the median, against budgets of 80 ms on desktop and 150 ms on phones. Find needs the offset of every match in a scene to highlight it, which an index does not give, so the scan is needed in any case. Dropping the index also removes the 0.9 MB word index and 5.1 MB trigram index, the index maintenance on every compaction, the 130 to 160 ms first-query warm-up in WebKit, and the free pages the index optimise step left behind.

This deviates from PLAN section 5, which named FTS5, and goes one step further than Spike B, which recommended keeping the word index and dropping only the trigram index. What is lost is ranking by relevance and matching that ignores accents; neither is what a writer expects from find. If projects grow to where a scan misses the budget, an FTS5 index over `doc_text` can be added by one migration; that is why `doc_text` has an integer key.

**Regular expressions run in a separate, disposable worker.** A pattern that backtracks without end would otherwise stop the storage worker and with it every save. For a regular-expression query the main thread fetches the text with `allText()`, hands it to a search worker created for that query, and terminates that worker if it has not answered within two seconds. Literal queries cannot backtrack and run in the storage worker.

## 10. Where pagination and script formats plug in later

Phase 1 builds none of this. It leaves four places for it:

1. **Format profile** (section 4.1). A screenplay is a second profile object: its own schema, key behaviour and height estimate. The project's `profile` value selects it.
2. **Decorations from outside** (section 8.4). A paginator running in its own worker (Spike C) reports page breaks as ranges per scene; the pane shows them like any other decoration source.
3. **Scene statistics** (`scene-stats` events and the `chars` and `blocks` columns). A screenplay profile's height estimate can be exact because its text is fixed-pitch.
4. **Exporters** are functions under `src/features/export/` that read documents through `openDocs` and return a file. FDX, Fountain and PDF are further functions.

Rejected: a general layout-engine or plugin interface now. Spike C's paginator takes a flat list of elements and returns pages; nothing in Phase 1 needs to know that.

## 11. Service worker and updates

**The invariant: a page from one build never runs with assets from another build**, on any host, with any cache headers.

The failure this prevents is known from installed iPhone web apps: the browser restores a weeks-old HTML document from its own cache, the hashed scripts and styles that document names no longer exist on the server, and the app shows as an unstyled, dead page. The known repair has three parts: stop trusting the browser's HTTP cache for documents, keep each build's caches apart, and detect and reload a page that belongs to another build. Fjäder is static and must also start offline, so it applies the three parts this way: once installed, the service worker is the only source of the app's files, and it serves one complete build or nothing.

**Build id.** The build script sets the build id to the short commit hash (with a time suffix when the working tree is not clean). It is compiled into the app bundle, written into `index.html` as `<meta name="fjader-build" content="…">`, and compiled into the service worker together with the list of every file in the build.

**Install is all or nothing, and verified.**

1. The service worker fetches every file in its list, bypassing the browser's HTTP cache (`cache: 'no-cache'`), and fetches `index.html` with the build id as a query string so that a CDN cannot answer with a copy from an earlier build.
2. It rejects any response that is not `200`, and any asset response whose content type is HTML (a host that answers unknown paths with the app shell).
3. It checks that the fetched `index.html` contains its own build id.
4. Only when every file has passed does it store them in a cache named `fjader-<buildId>`. If anything fails, installation fails, nothing is stored, and the browser tries again at the next update check.

**Serving.** For a navigation, the worker answers with `index.html` from its own cache and never asks the network. For any other file in its list, it answers from its own cache. It never serves a file from another build's cache. A same-origin request that is not in the list goes to the network with `cache: 'no-store'`.

**Activation happens only when the page is ready to reload.**

- A newly installed worker waits. It does not take control by itself, with one exception: the very first install, when no worker controls the page.
- The page checks for an update on launch, each time it becomes visible, and once an hour while visible (`registration.update()`, registered with `updateViaCache: 'none'`).
- When a worker is waiting, the page applies the update at the first of: the page becomes hidden; the writer presses "Update now" in the notice the app shows; no project is open. To apply it, the page awaits `StorageClient.flush()`, tells the waiting worker to activate, and reloads when the new worker has taken control.
- If the app was fully closed, the waiting worker activates before the next launch and the app starts on the new build.
- On activation a worker deletes every `fjader-*` cache that is not its own and claims the open pages.

**The page checks who controls it.** On start and whenever its controller changes, the page asks the controlling worker for its build id. If the id differs from the page's own, the page flushes storage and reloads at once. This covers a second window that was open when another window applied an update, and a first visit during which a deploy happened between loading the page and installing the worker.

**Last line of defence.** A small inline script in `index.html` reloads the page once if a same-origin script or stylesheet fails to load or a lazy chunk fails to import, with a 30-second guard in `sessionStorage` against reload loops. It runs even when no worker controls the page.

Reasons for waiting instead of taking control as soon as a new worker is installed: a server-rendered site can reload at any time, but here a reload interrupts someone typing. The cost of waiting, an installed app that is never closed staying on an old build, is removed by applying the update whenever the app is hidden, which on a phone happens many times a day.

Rejected: Workbox precaching, whose install is per file and whose routing we would have to override to get the verified, all-or-nothing install; network-first navigation, which cannot start offline.

**What the host must do.** Serve the files over HTTPS; answer a missing file with a real 404, not the app shell; serve `.wasm` as `application/wasm`. Nothing else is required for correctness.

**Cache headers, where the host allows them**, as a second layer:

| Path | Header | Reason |
|---|---|---|
| `/assets/*` (hashed names) | `Cache-Control: public, max-age=31536000, immutable` | The name changes when the content does. |
| `/`, `/index.html` | `Cache-Control: no-store` | WebKit shows a stored document without revalidating when it restores a page. |
| `/sw.js`, `/manifest.webmanifest` | `Cache-Control: no-cache` | A stale copy keeps a device on an old build. |
| any 404 | `Cache-Control: no-store` | A cached 404 for a file name outlives the deploy that brings the file back. |

`public/_headers` carries these rules in the format Cloudflare and Netlify read. A host that cannot set headers (GitHub Pages) still serves a correct app, because the service worker does not rely on them.

## 12. Errors and data-loss prevention

**The writer's text is the thing to protect.** In order:

1. **Fast, acknowledged saves.** Section 6.4. The interface shows the SceneStore's save state: "Saved", "Saving…", or an error.
2. **Flush on hide**, because a phone gives no later chance.
3. **Storage persistence.** When the first project is created the app calls `navigator.storage.persist()` and shows the answer in the storage settings. Spike B could not test what phones answer.
4. **Backup file.** A project exports to one file with the extension `.fjader`, which is the project's SQLite database after a checkpoint. Any SQLite tool can open it. Importing a backup always creates a separate project with a new id and never overwrites an existing one. The app records the time of the last backup and, when a project has changed and has not been backed up for seven days, shows a reminder. Spike B did not measure exporting the database file; package 13 must prove the round trip.
5. **Snapshots** (section 4.6) and the **Trash** (section 4.2) protect against the writer's own mistakes.
6. **Migrations** copy the database first (section 5).

**Error handling.**

- Every storage failure reaches the main thread as a `StorageError` with a code. The app maps each code to one screen or notice with a plain explanation and the actions that make sense: `unavailable` (cannot store projects in this browser), `quota` (out of space; export a backup, free space), `corrupt` and `migration-failed` (download the raw database file; restore from a backup), `newer-schema` (update the app; download the file).
- A write failure that survives the restart in section 6.4 shows a notice that cannot be dismissed, "Your latest changes are not being saved", with a button that downloads the open scenes' text from memory.
- A React error boundary surrounds each pane and the whole app. An exception in the interface does not stop the storage worker; the boundary shows what happened and offers "Reload" and "Export backup".
- The worker runs `PRAGMA quick_check` once per session after the project is open and idle, and reports a failure as `corrupt`.
- `navigator.storage.estimate()` is never shown as a project's size; Spike B found it reports a high-water mark. The storage settings show the database's own page count times page size.

## 13. Testing

| Level | Tool | What it covers |
|---|---|---|
| Unit | `bun test` | Everything without a DOM: `model/`, order keys, text and offsets, provenance rules, the undo coordinator and stores against in-memory Yjs, the storage worker's logic through the `Db` interface over Bun's SQLite, migrations, import splitting, DOCX output (unzipped and inspected), the service worker's install and serve decisions as pure functions. |
| Browser | Playwright, Chromium and WebKit, against the production build | The real storage layer; kill and reopen; two tabs; editing across scenes; find in unmounted scenes; the update flow with two builds; offline start; accessibility checks with axe. |
| Performance | Playwright, same job | The budgets in PLAN section 6, on the 300,000-word project. |

**The performance test.** `tests/perf/fixture.ts` generates the test project with a fixed seed: about 150 chapters and 600 scenes of 100 to 3,000 words, plus one scene of 10,000 words, 300,000 words in all (the shape the spikes used). It writes the project as a backup file using the storage worker's own schema code over Bun's SQLite. Tests load it through the storage client's import (`open` with `importFrom`): in the app through the library screen's "Restore from backup", and in package 03's own tests through a harness page that is built separately in production mode and never deployed. No test-only code ships in the production build.

`tests/perf/budgets.ts` is the single table of thresholds, copied from PLAN section 6. Each package adds the measurements for the budgets it must prove. Rules:

- Chromium runs with CPU slowed four times and is held to the **phone** budgets; WebKit runs unthrottled and is held to the phone budgets. Spike A argues that four times slower than this class of machine is slower than the target phones, so this is the strict side. One known exception is written into the table: keystroke latency in the 10,000-word scene is checked unthrottled (Spike A measured 44 ms at four times slowdown against 32 ms).
- CPU throttling does not reach workers (Spike C), so storage and search timings are effectively unthrottled.
- Each timing is the median of at least five runs, or a percentile over at least 300 samples for keystrokes. A failed measurement is run once more before the job fails.
- Results are written as JSON, attached to the workflow run, and summarised in the job summary.

The test compares against budgets, not against the previous run. Reason: budgets are what the product promises, and a stored baseline on shared CI machines produces noise. Rejected: a baseline-and-tolerance scheme.

**Real devices.** Automated tests do not replace the phone checklists in the spike findings. Section 17 lists them.

## 14. Accessibility baseline

The target is WCAG 2.2 level AA for everything outside the text of unmounted scenes, which is the known gap.

- Every function is reachable from a keyboard; focus is always visible; focus order follows the layout.
- Dialogs use the native `<dialog>` element, menus use the `popover` attribute, so focus trapping and dismissal are the browser's.
- The tree follows the WAI-ARIA tree pattern, with a keyboard alternative to dragging.
- Text and interface colours meet 4.5:1 contrast; the app follows the system light or dark scheme and `prefers-reduced-motion`.
- Touch targets are at least 44 by 44 CSS px on touch devices.
- Sizes are in `rem`; the layout works at 200 percent zoom and at a width of 320 CSS px.
- Status changes (save state, match counts, errors) are announced through live regions.
- **The editor.** The pane is a `feed` in WAI-ARIA terms: each slot is an `article` with a label made of its folder and scene titles and its position in the manuscript ("Scene 12 of 600"). A mounted scene's editor is a labelled multi-line text box. An unmounted slot can take focus; taking focus mounts it. A screen reader can therefore reach any scene, but can read continuously only through mounted ones. The tree and quick open are the direct routes to any scene.
- Each package's browser tests run axe on the screens it adds and fail on violations.

Rejected: a component library for accessible widgets. Native elements cover dialogs and menus; the tree is the one custom widget. Revisit if the tree's accessibility tests prove costly to pass.

## 15. Mobile baseline

- Layout: at widths under 720 CSS px the sidebar and side panel become bottom sheets and the formatting toolbar sits directly above the on-screen keyboard.
- The on-screen keyboard is handled in one file, `src/platform/keyboard.ts`, which follows `visualViewport` to report the keyboard's height and keep the caret visible. This is untested on a device (Spike A) and the WebKit keyboard bugs in the research apply.
- No feature needs hover, a right click, or a hardware keyboard.
- The app requests no permissions other than persistent storage.

## 16. Internationalisation stance

- The interface ships in English. Every string the writer sees comes from one typed catalogue, `src/i18n/en.ts`, through `t(key, params)`. Adding a language is adding a file. Rejected: an i18n library, for one language.
- Dates and numbers are formatted with `Intl` in the browser's locale.
- A project has a language (`meta.lang`). It is set as the `lang` attribute on the editor, so that the browser's spellcheck and the DOCX export use it.
- Text blocks carry `dir="auto"`, so right-to-left text displays correctly. Right-to-left manuscripts are not tested in Phase 1.
- Word counts split on white space, which is wrong for Chinese, Japanese and Thai. That is a known limit.
- Search is case-insensitive by default and does not ignore accents: "a" does not match "ä".

## 17. Provisional decisions and what changes if a phone check fails

| Provisional item | Evidence so far | Isolated in | If the phone check fails |
|---|---|---|---|
| Correcting `scrollTop` during a scroll | 0.00 px shift in Chromium and desktop WebKit, including touch flicks in Chromium | `src/editor/windowing/anchor.ts` | First: switch to the browser's own anchoring (`?anchor=native` becomes the default). If that also fails: position slots absolutely and re-base their offsets only while the scroll is at rest; Spike A estimates up to eight days. Nothing outside the file and the slot's CSS changes. |
| `opfs-sahpool` on phones: speed, kills, long suspension, eviction | 128 kills without corruption on desktop engines; phones not run | `src/storage/worker/sqlite.ts` | A handle lost after suspension is already handled by the worker restart (section 6.4). A systematic failure means replacing the file's contents with wa-sqlite's `OPFSCoopSyncVFS` in a build of our own; the `Db` interface and the protocol stay. Writes would take 4 to 5 ms instead of under 1 ms, still inside the 20 ms budget. |
| On-screen keyboard and `visualViewport` | Not tested on any device | `src/platform/keyboard.ts` | Changes stay in that file and the toolbar's positioning. |
| Typing with autocorrect, dictation, swipe input and Android composition | Automation cannot drive them | The per-scene editor is plain ProseMirror, which has code paths for these | A defect here is a ProseMirror issue to work around per scene; the windowing layer only has to keep a composing scene mounted, which it does. |
| Touch selection across scenes | Expected to stop at the boundary; not tested | `src/editor/selection/` | Custom handles, about ten days in Spike A's estimate. Decide after the phone test. |
| Very long scenes | 44 ms keystroke at four times slowdown in a 10,000-word scene | Not isolated | If phones show lag, cap how much of a long scene one editor holds. Not built in Phase 1. |
| `persist()` and eviction on iOS | Refused in headless browsers; unknown on phones | Backup reminders do not depend on it | If iOS refuses, the reminder interval for unbacked changes is shortened. |
| Scroll stops, blank areas during a fling | A long frame is the only signal automation gives | Mounting window sizes in `src/editor/windowing/` | Widen the prefetch and mounting margins. |
