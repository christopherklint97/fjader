# Package 03: Storage worker

## Goal

Projects are stored durably on the device: one SQLite database per project in a Web Worker, with the write path, compaction, locking and migrations of `architecture.md` sections 5 and 6. This package implements the core of the protocol; later packages fill in search, snapshots, bookmarks, the daily counter and backup export.

## User-visible behaviour

None directly. Through package 04 the writer sees that text survives closing the app, that a second tab waits, and that a clear message appears when storage is unavailable.

## Contracts provided

**`src/storage/client.ts`**: `createStorageClient(): StorageClient`, the main-thread side of `architecture.md` section 6.3. It starts the worker, matches responses to requests, turns a failed response into a rejected promise carrying a `StorageError`, transfers byte buffers instead of copying them, and delivers events to listeners.

**`src/storage/library.ts`**: main-thread functions that need no worker.

```ts
export function listProjects(): Promise<ProjectInfo[]>           // reads projects/*/info.json, newest first
export function deleteProject(id: ProjectId): Promise<void>      // takes the project's Web Lock, removes the directory
export function newProjectId(): ProjectId
```

`deleteProject` rejects with code `io` when the project is open in any tab.

**`src/storage/worker/`**

| File | Content |
|---|---|
| `index.ts` | message loop; one promise chain so that no two database operations interleave; the handler table |
| `sqlite.ts` | `openDatabase`, the `Db` interface, pragmas; the only file that imports the SQLite package (section 6.2) |
| `lock.ts` | the Web Lock; emits `lock-waiting` |
| `migrations/001.ts`, `migrate.ts` | schema version 1 exactly as in section 5; the runner and the pre-migration copy |
| `queue.ts` | the write path of section 6.4 |
| `compact.ts` | compaction of section 6.5, including `doc_text`, node statistics and `daily_words` |
| `info.ts` | writes `info.json` |
| `handlers/lifecycle.ts`, `tree.ts`, `docs.ts`, `meta.ts` | implemented here |
| `handlers/search.ts`, `snapshots.ts`, `bookmarks.ts`, `words.ts`, `backup.ts` | stubs that reject with `not-implemented` |

Behaviour the section 6 text does not spell out:

- `open` with `create` makes the directory, the database, the `meta` rows, and one empty scene at the top level. `open` with `importFrom` checks that the bytes are a SQLite database whose `meta.format` is `fjader-project`, stores them as the project's database, writes a new `project_id`, and runs migrations. A file that fails the check is rejected with `corrupt` and leaves no directory behind. `open` with neither opens an existing project or rejects with `not-found`.
- `openDocs` returns, for each scene, the stored state, the logged updates in order, and the highest sequence number. It does not compact.
- `createNodes` with a `state` stores it as the scene's document and fills `doc_text` and the statistics from it. A scene created without a state gets `emptySceneState`.
- `trashNode` and `restoreNode` set and clear `trashed_at` on that node only. `purgeNodes` deletes the nodes and, by cascade, their descendants, documents, snapshots and bookmarks.
- `setMeta` accepts any subset of `ProjectMeta` except `projectId`, `profile` and `createdAt`.
- The first committed update after `last_backup_at` sets `changed_since_backup`.
- `queue.ts` calls `beforeFirstUpdate(sceneId)` from `handlers/snapshots.ts` when a scene receives its first update after being opened. The stub does nothing; package 11 implements the automatic snapshot there.
- `close` flushes, compacts every scene with a log, checkpoints, closes the database, writes `info.json`, and releases the lock.

## Contracts consumed

Package 01: `storage/protocol.ts`, `model/convert.ts` (`ydocFromStored`, `docFromYdoc`), `model/text.ts` (`plainText`, `statsOf`), the `prose` profile.

## Data model changes

Creates schema version 1 (section 5) and the OPFS layout (section 6.1).

## Acceptance criteria

Unit tests run the worker's modules over the `Db` interface backed by Bun's SQLite. Browser tests run the real worker in Chromium and WebKit. "The fixture" is the 300,000-word project of section 13; this package adds `tests/perf/fixture.ts`.

Because the app has no project screen yet, this package's browser tests use a harness: `tests/harness/storage.html` and a script that puts `createStorageClient` and `listProjects` on `window`. `bun run build:harness` builds it in production mode into `dist-harness/`, `scripts/serve.ts` serves it under `/harness/` when the directory exists, and it is never part of `dist/`.

1. Creating a project, appending 1,000 updates to a scene, closing, and reopening yields a document whose text equals the text built by applying the same updates in memory.
2. An update is reported `durable` only after its transaction has committed: in the unit test, a `Db` whose commit fails produces a `write-error` event and no `durable` event; when commits succeed again the update becomes durable without being sent again.
3. Sending the same `(sceneId, seq)` twice stores one row.
4. A scene's log is compacted when it reaches 200 updates, when it reaches 32 KB, on `closeDoc`, and on `flush` after the page is hidden. After compaction `doc_text.body` equals `plainText` of the document and `node.words`, `chars` and `blocks` equal `statsOf`.
5. After compaction on a new local day, `daily_words` has a row for that day whose `start_words` is the manuscript total before the day's first change.
6. Kill test, in each engine: while a page types one change every 100 ms, the browser process is killed; on reopening, `PRAGMA integrity_check` returns `ok`, every update reported durable is present, and the sequence has no gap. Repeated 20 times per engine.
7. A second tab opening the same project receives `lock-waiting` and opens the project within one second of the first tab closing it. Two tabs open two different projects at once.
8. A database with `user_version` 99 is rejected with `newer-schema` and is not modified.
9. With a test migration to version 2 registered, opening a version 1 project with data writes `pre-migration.fjader` first; if the migration throws, the database is still at version 1 and `open` rejects with `migration-failed`.
10. After importing the fixture, the files under the project's `db/` directory total at most 30 MB, and the write-ahead log is at most 2 MB.
11. `open` with `importFrom` set to 1 MB of random bytes rejects with `corrupt` and `listProjects()` does not list a new project.
12. `listProjects` returns title, word count and time for each project without starting a worker.
13. Where OPFS is missing, `open` rejects with `unavailable`. (Tested by removing `navigator.storage.getDirectory` in the page.)
14. `PRAGMA journal_mode` returns `wal`, `synchronous` returns 1, `locking_mode` returns `exclusive`, and `foreign_keys` returns 1 on an open project.
15. Every stub handler rejects with `not-implemented`.

## Performance budgets

Measured on the fixture in both engines; added to `tests/perf/`. CPU throttling does not reach workers, so these are unthrottled figures held to the phone budget.

| Budget | Threshold | Spike B, for comparison |
|---|---|---|
| Starting the worker to the tree loaded, cold | at most 300 ms | 223 ms Chromium, 263 ms WebKit |
| Loading one scene's document, warm, 95th percentile | at most 50 ms | 9 ms |
| Loading a scene with 200 logged updates | at most 50 ms | 2 to 15 ms at 100 updates |
| Write batch in the worker, 95th percentile over 5 minutes of typing | at most 20 ms | 2.1 ms, 1 ms |
| Change made to change durable, 95th percentile | at most 500 ms | 252 ms |
| Main-thread time per change, 95th percentile | at most 2 ms | 0.4 ms, 1 ms |
| Typing lost in a kill (criterion 6), worst case | at most 1 s | 300 ms |
| Stored size before snapshots | at most 30 MB | about 6 MB without the search indexes |

## Accessibility and mobile

None in the interface. The flush on hide is the mobile requirement: it must be the first thing the worker does after `flush()` arrives, before compaction.

## Out of scope

Search, snapshots, bookmarks, the daily counter's read side, backup export (their stubs exist). Any user interface. Sync. More than one connection per project.

## Dependencies

Package 01.
