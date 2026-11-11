# Spike B: storage and durability

## Question

Is SQLite on the Origin Private File System (OPFS), holding one Yjs document per scene, fast enough and durable enough on phones, and which SQLite storage layer should the app use?

## Why it is risky

- iOS kills pages under memory pressure and then reloads them (`docs/research/editor-storage-tech.md`, §7). A writing app must not lose text when that happens.
- The two candidate storage layers trade off differently (§4). The official build's `opfs-sahpool` needs no special response headers but allows one connection. The official `opfs` layer and wa-sqlite's `OPFSCoopSyncVFS` handle multiple connections; the official `opfs` layer needs cross-origin isolation headers and Safari 17 or later.
- OPFS is unavailable in Safari private mode (§4).
- Storage persistence on iOS is granted by heuristics (§4). Home Screen web apps are not expected to lose data, but that is the vendor's statement, not something we have tested.
- Scrivener's most common complaint after export is sync conflicts (`docs/research/prose-publishing.md`, §1). One Yjs document per scene is the plan's answer, so its storage cost and load time must be known.

## Constraints

- TypeScript, Vite, a Web Worker that owns the database. Yjs 13. No editor: edits are simulated by applying text changes to Yjs documents.
- Compare two storage layers behind one small interface: the official SQLite WASM build with `opfs-sahpool`, and wa-sqlite with `OPFSCoopSyncVFS`. Confirm each library's licence is compatible with AGPL-3.0 before using it and record it.
- Loro is not part of this spike. Note it as the alternative to evaluate only if Yjs fails a threshold.
- Code lives in `spikes/B/` and is thrown away.

## What to build

A page with buttons and a results readout, and a worker with this minimal schema:

- `nodes`: the project tree (id, parent, order key, title, word count).
- `doc_updates`: Yjs updates per document, appended as they happen.
- `doc_state`: one compacted Yjs state per document, rewritten when the update log for that document grows past a set size.
- `snapshots`: saved document states.
- `search`: an FTS5 table over each document's plain text.

Operations:

1. **Import** the 300,000-word test project from `spikes/shared/`.
2. **Open project:** load the tree, then load one document's state.
3. **Simulated typing:** apply one small change every 100 ms to one document for five minutes; each change is written within 500 ms, in batches.
4. **Kill test:** show a counter that increases with every persisted change, so the last durable value can be compared after a restart.
5. **Snapshot and restore** a document, and take a snapshot of every document.
6. **Search:** word, phrase, and substring (trigram tokenizer) queries through FTS5, and a regular-expression scan over all documents' text. Check FTS5 is present with `PRAGMA compile_options`.
7. **Two tabs:** open the page twice and type in both. Record what each storage layer does, and whether a lock (Web Locks) can make the second tab wait or go read-only cleanly.
8. **Environment report:** OPFS available or not, result of `navigator.storage.persist()`, and `navigator.storage.estimate()`.

## What to measure

Automated, in Chromium and WebKit, per storage layer:

- Import time and database size on disk, split into document states, update log and search index.
- Open project: time to tree loaded, and time to one document loaded.
- Write latency in the worker per batch: 95th percentile.
- Search times for each query type.
- Snapshot and restore time for one document, and for all documents.
- Size growth after the five-minute typing run, before and after compaction.

Manual, on a real iPhone (installed to the Home Screen) and a real Android phone (Chrome), per storage layer:

- [ ] Run import and note the readout.
- [ ] Start simulated typing, then swipe the app away mid-run. Reopen. Does the counter resume within one second's worth of the last value shown? Repeat 20 times; note any corruption or error.
- [ ] Start typing, lock the phone for ten minutes, unlock. State intact?
- [ ] Open a dozen heavy pages in other apps to force a memory kill, return. State intact?
- [ ] Restart the phone. State intact?
- [ ] On the iPhone, open the page in a Safari private tab. Is there a clear "storage unavailable" result?
- [ ] Note the environment report.

## Pass thresholds

From `docs/PLAN.md`, section 6, on the real phones:

- Tree loaded in at most 300 ms and one document loaded in at most 50 ms, so that opening the project fits the 1.5 s budget with room for the editor.
- Write batch latency: 95th percentile at most 20 ms in the worker, with no effect on the main thread.
- Word and phrase search in at most 150 ms; regular-expression scan in at most 1.5 s.
- Stored size of the imported project at most 30 MB, including the search index.
- Kill test: at most 1 s of typing lost, and no corruption or unreadable database in 20 kills.
- Snapshot of one document in at most 50 ms; restore in at most 100 ms.

## Deliverable

- The demo in `spikes/B/`, with one command to build and one to serve (including the cross-origin isolation headers if a tested layer needs them).
- `docs/spikes/results/B.md`: numbers per storage layer, browser and device; kill-test results; multi-tab behaviour; the environment reports; the dependency list with licences; what failed and why; and one recommendation naming the storage layer, the write batching interval and the compaction rule.

## Out of scope

The editor, the ProseMirror binding for Yjs, sync between devices, the sync server, encryption, the backup file format, and the final schema. The schema above exists only to make the measurements honest.
