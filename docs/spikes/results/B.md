# Spike B results: storage and durability

Spec: `docs/spikes/B-storage.md`. Code: `spikes/b/` (throwaway). Raw data: `spikes/b/test/out/*.json`; every table here is generated from those files by `spikes/b/test/report.mjs` (full output in `spikes/b/test/out/tables.md`).

## Status

- **Automated part: done.** Chromium and WebKit under Playwright on a Raspberry Pi 5.
- **Manual phone part: not run.** The pass thresholds are defined on real phones, so every verdict below is a first signal from a desktop-class host, not the result that counts. The checklist and the phone demo are ready (see "Manual phone checklist").
- Yjs met every threshold, so Loro was not evaluated.

## Answer in short

SQLite on OPFS in a worker, with one Yjs document per scene, is fast and survived every kill in the automated runs. Both candidate layers pass on the Pi. The two official layers that need cross-origin isolation headers fail on write latency and start-up time.

| Threshold (from `PLAN.md` §6) | official `opfs-sahpool` | wa-sqlite `OPFSCoopSyncVFS` | official `opfs` (needs headers) | official `opfs-wl` (needs headers) |
|---|---|---|---|---|
| Tree loaded ≤ 300 ms (from starting the worker, cold) | pass: 223 ms Chromium, 263 ms WebKit | pass: 194 / 242 ms | **fail: 437 ms** | **fail: 801 ms** |
| One document loaded ≤ 50 ms | pass: warm median 1 ms, p95 ≤ 9 ms; first after cold start 42 / 10 ms | pass: warm median 1–2 ms; first 21 / 9 ms | pass: 16 ms | **fail: 68 ms** |
| Write batch p95 ≤ 20 ms, no effect on main thread | pass: 2.1 / 1 ms | pass: 6.3 / 7 ms | **fail: 111 ms** | **fail: 155 ms** |
| Word and phrase search ≤ 150 ms | pass warm (12–14 ms); first query after start in WebKit 157 ms | pass warm; first query in WebKit 131 ms | pass: 26 ms | pass: 65 ms |
| Regular-expression scan ≤ 1.5 s | pass: 10–12 ms | pass: 20–61 ms | pass: 13 ms | pass: 38 ms |
| Stored size ≤ 30 MB with search index | pass: 15.5 MB (11.2 MB after `VACUUM`) | pass: 15.3 MB (11.1 MB) | pass: 15.5 MB | pass: 15.5 MB |
| Kill: ≤ 1 s lost, no corruption in 20 kills | pass: 128 kills, 0 corrupt, worst loss 300 ms | pass: 128 kills, 0 corrupt, worst loss 300 ms | pass: 32 kills (Chromium only), worst 300 ms | not run |
| Snapshot one document ≤ 50 ms | pass: ≤ 4 ms | pass: median 3–9 ms, one 69 ms outlier | pass at median (18–24 ms), max 166 ms | pass: 20–25 ms |
| Restore one document ≤ 100 ms | pass: 6 ms typical, 50 ms for 10,000 words | pass: 8 ms typical, 39 ms for 10,000 words (max 164) | **fail: 92 ms typical (max 481), 211 ms for 10,000 words** | borderline: 48 ms typical, 98 ms for 10,000 words |
| On real phones | not run | not run | not run | not run |

Figures are p95 unless noted; where two values are given they are Chromium / WebKit.

**Cross-origin isolation headers are not needed**, and the layers that need them are the ones that fail. `opfs-sahpool` and `OPFSCoopSyncVFS` work identically with and without the headers.

## Recommendation

1. **Storage layer: the official SQLite WASM build with `opfs-sahpool`**, in one dedicated worker, no COOP/COEP headers.
   - Pragmas: `locking_mode=exclusive`, `journal_mode=wal`, `synchronous=normal`, `wal_autocheckpoint=128`, `journal_size_limit=1048576`, and `PRAGMA wal_checkpoint(TRUNCATE)` after bulk writes (import, `VACUUM`).
   - One Web Lock per project database, taken before the storage layer is installed. A second tab then waits with a notice and takes over 100–300 ms after the first tab closes.
   - Why this one, given both pass and neither needs headers: write transactions cost a tenth (median 0.3–0.5 ms against 4–5 ms), because one connection allows WAL; it is the SQLite project's own build, current (3.54.1), with FTS5 and `dbstat` compiled in; the alternative needs either our own Emscripten build or a fork that carries an unrelated extension (see "What broke").
   - What it costs: no second connection. Two tabs cannot both have the project open. For a writing app that is acceptable; if it ever is not, `OPFSCoopSyncVFS` handled two tabs typing at once without errors.
2. **Write batching: 250 ms**, started by the first queued change, plus an immediate flush when the page becomes hidden. Measured: a change is durable 251–257 ms (p95) after it is made, worst 314 ms; kills lost at most 300 ms.
3. **Compaction rule:** fold a document's update log into its state when the log reaches **200 updates or 32 KB**, when the document is closed, and when the page becomes hidden. Compact by loading the state and log into a `Y.Doc` and re-encoding it, not with `Y.mergeUpdates`. Refresh that document's search text in the same transaction.
   - Reason for 200: loading a document with a 500-update log took 11–19 ms in Chromium but up to 75 ms in WebKit, above the 50 ms budget; with 100 updates it took 2–15 ms.
4. **Search index: word index only; drop the trigram index** and do substring search by scanning. The trigram index is 5.1 MB of an 11.2 MB database, a `LIKE` scan of the whole project takes 7–16 ms and a regular-expression scan 8–18 ms. This changes `PLAN.md` §5 (search row).
5. **Run one cheap search right after start-up** so the first real query does not pay WebKit's one-off 130–160 ms.

Do not start phase 1 on this recommendation until the phone checklist below has been run for `opfs-sahpool`.

## Setup

| | |
|---|---|
| Host | Raspberry Pi 5 Model B (4 × Cortex-A76, 8 GB), Debian 13 arm64, browser profiles on a USB SSD. A shared, capped host with other services running. |
| Chromium | HeadlessChrome 156.0.8078.4 (Playwright 1.64.1, build 1248), headless |
| WebKit | Playwright's Linux WebKit build 2370 (reports Safari 27.2), headless. It installed cleanly on this host. **It is not Safari on iOS**: different storage back end, process model and kill behaviour. |
| Build | Vite 8.3.8 production build, the same files that are on the phone demo host |
| Fixture | `spikes/shared/fixture-b.ts`, fixed seed: 300,000 words, 150 chapters, 600 scenes (100–3,000 words, one of 10,000), 2.06 MB of text, about 10,000 distinct words with a Zipf-like distribution |
| Document shape | per scene, one `Y.Doc` holding an `XmlFragment` of paragraph elements with one `XmlText` each (what the ProseMirror binding stores) |
| Typing | one change per 100 ms: 88% one character at the end, 4% backspace, 2% new paragraph, 6% a word inserted elsewhere. Deterministic, so a run is verified by replaying it and comparing text. |
| Timer resolution | Chromium 0.1 ms; WebKit 1 ms (WebKit figures are whole milliseconds) |

Sample sizes: 5-minute typing runs give about 1,000 write batches each; cold starts are 10 new browser processes per layer; searches 15 runs per query; snapshots 5 per case; kills 64 per layer per browser.

Noise: the host was not quiet. Each timed run records a fixed CPU workload ("calibration", normally 32 ms in Chromium, 15 ms in WebKit); runs where it rose are marked in the raw data. A first Chromium pass ran while another job loaded the host (load average 5) and is kept only as `*-run1-loaded-host.json`; it showed 17.7 ms p95 for `OPFSCoopSyncVFS` writes where the quiet runs show 6–8 ms. Maxima in every table are sensitive to this; medians and p95 are the figures to use.

Commands, in `spikes/b/`: `npm install`, `npm run build`, `npm run serve` (serves the build at `/b/` without and at `/coi/b/` with the isolation headers, on `127.0.0.1:4173`). Automated runs: `sh test/run-chromium.sh`, `sh test/run-webkit.sh`, `node test/kill.mjs <browser> <plain|coi> <layers>`, `node test/tabs.mjs …`.

## Numbers

Chromium and WebKit, no isolation headers, recommended pragmas per layer (`opfs-sahpool`: WAL as above; `OPFSCoopSyncVFS`: library default, rollback journal, `synchronous=full`). Milliseconds unless noted.

| Measure | Chromium `opfs-sahpool` | Chromium `OPFSCoopSyncVFS` | WebKit `opfs-sahpool` | WebKit `OPFSCoopSyncVFS` |
|---|---|---|---|---|
| Cold start, navigation to tree loaded, median (range) | 344 (327–910) | 311 (297–363) | 386 (368–440) | 358 (344–392) |
| Cold start, starting the worker to tree loaded | 223 (201–533) | 194 (169–215) | 263 (250–300) | 242 (229–272) |
| of which WASM start / layer install / open + pragmas + schema / tree query | 60 / 11 / 35 / 42 | 26 / 16 / 43 / 26 | 110 / 12 / 19 / 35 | 87 / 21 / 29 / 22 |
| First document after the tree | 42 (8–63) | 21 (11–52) | 10 (9–20) | 9 (9–25) |
| Document load, warm, median / p95 | 0.9 / 9.1 | 1.9 / 44.6 | 1 / 3 | 1 / 6 |
| Document load, 10,000-word scene | 3.5 | 2.6 | 3 | 4 |
| Write batch in the worker, median / p95 / max (n ≈ 1,000) | 0.3 / 2.1 / 45 | 4.2 / 6.3 / 40 | 0 / 1 / 11 | 4 / 7 / 18 |
| Change made to change durable, p95 / max | 252 / 314 | 256 / 302 | 251 / 265 | 257 / 270 |
| Main thread per change, p95; timer drift p95 | 0.4; 0.2 | 0.3; 0.1 | 1; 1 | 0; 4 |
| Word search, very common word (599 scenes), first 20 by rank with snippets: first run / median | 30 / 14 | 32 / 12 | 157 / 12 | 131 / 14 |
| Word search, rare word, p95 | 0.9 | 1.4 | 1 | 11 |
| Phrase search, p95 | 0.8 | 1.5 | 1 | 4 |
| Substring through the trigram index, p95 | 7.2 | 4.7 | 4 | 5 |
| Substring by `LIKE` scan, no index, median / p95 | 6.5 / 25 | 16 / 46 | 7 / 10 | 15 / 17 |
| Regular-expression scan, median / p95 | 8 / 9.7 | 18 / 61 | 10 / 12 | 15 / 20 |
| Snapshot one document, median / max | 0.8 / 1.8 | 3.4 / 43 | 1 / 1 | 4 / 7 |
| Snapshot the 10,000-word scene, median / max | 1.9 / 3.7 | 8.9 / 69 | 2 / 3 | 6 / 7 |
| Restore by replacing the state, then reload, median / max | 5.9 / 30 | 8.1 / 27 | 2 / 22 | 8 / 17 |
| same, 10,000-word scene | 50 / 72 | 39 / 164 | 50 / 74 | 39 / 64 |
| Restore as a forward update, then reload, median / max | 30 / 50 | 27 / 90 | 17 / 34 | 20 / 23 |
| same, 10,000-word scene | 78 / 145 | 90 / 215 | 182 / 213 | 86 / 96 |
| Snapshot all 600 documents | 81 | 44 | 105 | 40 |
| Import (Yjs encode + SQL + commit) | 1,794 | 1,596 | 1,152 | 1,089 |
| Typing run verified by replay; integrity check at the end | ok; ok | ok; ok | ok; ok | ok; ok |

Search hit counts matched the planted needles in every run. `PRAGMA compile_options` reports `ENABLE_FTS5` in both builds.

"Restore by replacing" overwrites the stored state and is only correct for a document that is not synced. "Restore as a forward update" writes the snapshot's content into the current document as one new update, which is what a synced document needs; it grows the document by the replaced text (86 KB for the 10,000-word scene) and for that scene exceeds the 100 ms budget. Sync is out of scope here, so this is recorded, not decided.

### With the isolation headers

| Measure | Chromium official `opfs` | Chromium official `opfs-wl` | Chromium `opfs-sahpool` | Chromium `OPFSCoopSyncVFS` | WebKit `opfs-sahpool` | WebKit `OPFSCoopSyncVFS` |
|---|---|---|---|---|---|---|
| Starting the worker to tree loaded | 437 (341–598) | 801 (698–826) | 230 | 172 | 312 | 238 |
| Navigation to tree loaded | 590 | 1,099 | 349 | 300 | 627 | 580 |
| Write batch median / p95 / max | 17.7 / 111 / 282 | 23.3 / 155 / 281 | 0.4 / 2.6 / 8 | 4.2 / 6 / 12 | 0.3 / 0.7 / 8 | 5.1 / 7 / 8 |
| Change made to change durable, p95 / max | 357 / 698 | 479 / 673 | 251 / 259 | 256 / 306 | 251 / 266 | 257 / 272 |
| Import | 1,111 | 2,968 | 1,060 | 1,046 | 1,149 | 1,097 |
| Typing run length, s | 300 | 300 | 60 | 60 | 60 | 60 |

- Official `opfs` and `opfs-wl` pass every call through a second worker and a `SharedArrayBuffer`; that is where the 18–23 ms per write goes. They used `journal_mode=truncate`.
- The headers changed nothing for the two header-free layers in Chromium. In WebKit they added 220–240 ms from navigation to tree for both layers.
- In Playwright WebKit, official `opfs` and `opfs-wl` opened in 1 of 9 probes and otherwise never finished initialising. Cause not found; not checked in Safari. They are not on the recommended path.

### Size

| Part, MB | official build (8 KB pages) | wa-sqlite build (4 KB pages) |
|---|---|---|
| Document states (600 Yjs documents), payload / pages | 2.19 / 2.55 | 2.19 / – |
| Plain text kept for search and scans, payload / pages | 2.06 / 2.38 | 2.06 / – |
| Word index, payload / pages | 0.87 / 0.91 | 0.87 / – |
| Trigram index, payload / pages | 5.12 / 5.24 | 5.12 / – |
| Tree, pages | 0.08 | – |
| Update log after import | 0 | 0 |
| Database file after import, on disk | 15.49 (4.22 of it free pages left by the index optimise step) | 15.31 (4.23 free) |
| After `VACUUM`, on disk | 11.23 | 11.07 |
| `navigator.storage.estimate()` usage after import / after `VACUUM` | 37.75 / 37.75 | 18.88 / 50.33 |

- A Yjs state is 6% larger than its plain text. Page figures come from `dbstat`, which the wa-sqlite build does not have.
- Without the trigram index the database would be about 6 MB after `VACUUM`.
- `estimate()` reports a high-water mark in both browsers, not what is on disk; on-disk figures were read from the browser profile. Do not show `estimate()` to users as the project's size.

Index variants (official build; sizes are the same in both):

| FTS5 variant | Size, MB | Supports |
|---|---|---|
| word, `detail=full` (used) | 0.88 | words and phrases |
| word, `detail=column` | 0.58 | words, no phrases |
| word, `detail=none` | 0.26 | words, no phrases |
| trigram, `detail=full` (used) | 5.16 | substrings, 1–3 ms |
| trigram, `detail=column` | 2.03 | substrings by `LIKE`, 3–6 ms |
| trigram, `detail=none` | 0.70 | substrings by `LIKE`, 3–6 ms |

### Five-minute typing run: growth and compaction

Same in every layer and browser: 3,000 changes, about 1,000 batches of 3.

| | |
|---|---|
| Yjs update per change | median 12 bytes, max 27 |
| Update log after the run | 3,000 rows, 37.3 KB of payload |
| Database file | 11.20 → 11.31 MB (official), 11.06 → 11.18 MB (wa-sqlite) |
| On disk including the WAL file (`opfs-sahpool`) | 12.5 MB: the WAL stays near its 1 MB limit |
| Scene state + log before compaction | 38.2 KB |
| Scene state after compaction | 10.1 KB |
| File after compaction | 11.33 MB, 0.06 MB of it free |
| Compacting that 3,000-update log | 112–155 ms in the worker, 78–113 ms of it Yjs |

Compaction curve, Chromium `opfs-sahpool` (other layers and WebKit in `tables.md`):

| Scene | Updates in log | Load with log | Load after | Compaction | of which Yjs | of which reindex | `Y.mergeUpdates` instead | its result vs. re-encode, KB |
|---|---|---|---|---|---|---|---|---|
| typical | 100 | 3.3 | 1.4 | 14 | 2.8 | 4.6 | 8.3 | 7.8 vs. 7.5 |
| typical | 500 | 18.7 | 3.4 | 38 | 25 | 3.7 | 16 | 12.5 vs. 9.3 |
| typical | 1,000 | 25.9 | 1.6 | 45 | 25 | 4.3 | 59 | 19.7 vs. 13.1 |
| typical | 3,000 | 105 | 3.3 | 84 | 58 | 4.8 | 347 | 45.0 vs. 26.5 |
| 10,000 words | 100 | 3.9 | 1.1 | 74 | 7.7 | 28 | 4.3 | 74.0 vs. 73.7 |
| 10,000 words | 500 | 10.5 | 2.6 | 50 | 14 | 23 | 14 | 78.7 vs. 75.6 |
| 10,000 words | 3,000 | 66 | 3.3 | 115 | 67 | 26 | 356 | 110.7 vs. 91.9 |

- WebKit loads a 500-update log in 13–75 ms and a 3,000-update log in 67–242 ms, so the log must stay short.
- `Y.mergeUpdates` is slower beyond about 500 updates and leaves the state 30–70% larger.
- Reindexing the 10,000-word scene costs 20–28 ms, almost all of it the trigram index.

### Pragmas and batch interval

Three interleaved rounds of 20 s per combination, 250 ms batches; batch latency in the worker.

| Layer | Journal, `synchronous` | Chromium median per round | Chromium p95 per round | WebKit median | WebKit p95 |
|---|---|---|---|---|---|
| `opfs-sahpool` | delete, full (library default) | 5.4, 5.4, 5.3 | 15.9, 9.6, 7.5 | 7, 7, 6 | 9, 9, 8 |
| `opfs-sahpool` | truncate, full | 5.1, 5.2, 4.9 | 8.0, 9.1, 7.5 | 6, 5, 6 | 8, 8, 8 |
| `opfs-sahpool` | WAL (size-limited), normal | 0.3, 0.5, 0.4 | 0.5, 4.5, 0.6 | 1, 0, 1 | 1, 2, 1 |
| `OPFSCoopSyncVFS` | delete, full (library default) | 4.1, 5.1, 4.2 | 5.9, 8.3, 6.3 | 5, 5, 5 | 6, 7, 7 |
| `OPFSCoopSyncVFS` | delete, normal | 3.7, 3.8, 3.7 | 6.3, 6.2, 6.1 | 4, 4, 4 | 6, 6, 6 |

Batch interval, recommended pragmas, one 20 s run each:

| Batch interval | `opfs-sahpool` batch p95, Chromium / WebKit | `OPFSCoopSyncVFS` batch p95 | Change durable after, p95 |
|---|---|---|---|
| every change | 0.5 / 1 | 5.9 / 5 | 2–6 |
| 100 ms | 0.6 / 1 | 5.3 / 24 (one 503 ms batch in WebKit) | 102–125 |
| 250 ms | 0.5 / 1 | 6.3 / 7 | 251–257 |
| 500 ms | 4.7 / 2 | 7.0 / 8 | 502–508 |

- The gain is WAL, not the layer: with a rollback journal `opfs-sahpool` is no faster than `OPFSCoopSyncVFS`.
- A 500 ms interval already breaks the spec's "written within 500 ms". With `opfs-sahpool` the interval could be far shorter than 250 ms at no visible cost; 250 ms is kept to limit flash writes (one 8 KB page per commit is an estimate, not measured).
- `synchronous=normal` under WAL cannot corrupt the database but can lose the last commits on power loss. Power loss was not tested.

## Kill tests

The page types into one scene. The harness reads the "sent" and "durable" counters, kills, relaunches with the same profile, runs `PRAGMA integrity_check` and the FTS5 integrity check, replays the recovered number of changes on the fixture scene and compares text.

- "normal": one change per 100 ms, 250 ms batches. "stress": one change per 5 ms, every change its own transaction, compaction every 300 updates, so kills land inside writes.
- Kills: `SIGKILL` to every browser process at once; `SIGKILL` to the content process only (Chromium; the closest to what iOS does); closing the page; closing the browser.

| Browser, layer | Kills | Corrupt or unreadable | Acknowledged change missing | Typing lost, normal: median / worst | `SIGKILL`-all at normal settings |
|---|---|---|---|---|---|
| Chromium, `opfs-sahpool` | 64 | 0 | 0 | 100 / 300 ms | 20 runs, worst 300 ms |
| Chromium, `OPFSCoopSyncVFS` | 64 | 0 | 0 | 100 / 300 ms | 20 runs, worst 300 ms |
| Chromium (headers), official `opfs` | 32 | 0 | 0 | 200 / 300 ms | 10 runs, worst 200 ms |
| WebKit, `opfs-sahpool` | 64 | 0 | 0 | 0 / 200 ms | 20 runs, worst 200 ms |
| WebKit, `OPFSCoopSyncVFS` | 64 | 0 | 0 | 200 / 300 ms | 20 runs, worst 300 ms |

- 288 kills, no corruption, no gap in the update sequence, no change that had been acknowledged as durable was ever missing.
- "Lost" is the last "sent" value the harness saw minus what was recovered. The kill follows that reading by a few milliseconds, so the true loss can be one change higher.
- Reopening after a kill took at most 810 ms, including WAL or journal recovery.
- `localStorage` survived every `SIGKILL` here; the phone page relies on it for its own loss figure.

## Two tabs

| Layer | Second tab, no coordination | Both tabs typing for 20 s (different scenes) | Reads in one tab while the other writes | With a Web Lock |
|---|---|---|---|---|
| `opfs-sahpool` | fails to open. Chromium: "Access Handles cannot be created if there is another open Access Handle…"; WebKit: "The object is in an invalid state." | not possible | not possible | second tab waits and shows a notice; takes over 108–298 ms after the first closes, then writes |
| `OPFSCoopSyncVFS` | opens | no write errors, both scenes verified. Batch p95 42–43 ms (max 335) in Chromium, 8–9 ms in WebKit | 150 reads, median 2 ms, max 13–50 ms, no errors | also works: 105–190 ms takeover |
| official `opfs` (headers, Chromium) | opens | no errors; p95 21 ms, max 312 | 25 reads in 8 s, one took 6.3 s | 273 ms takeover |
| official `opfs-wl` (headers, Chromium) | opens | no errors; p95 19–24 ms | 126 reads, max 181 ms | 209 ms takeover |

- A Web Lock held by the worker for its lifetime makes the second tab wait cleanly in every layer. The second tab cannot read while it waits; "read-only" would need the first tab to answer its queries.
- `opfs-sahpool` also has `pauseVfs()` / `unpauseVfs()` (since SQLite 3.50) for handing the database over without closing a tab. Not tested.
- Editing the same scene in two tabs is a sync question and was not tested.

## Environment reports

| | Chromium, plain | Chromium, headers | WebKit, plain | WebKit, headers |
|---|---|---|---|---|
| `crossOriginIsolated`, `SharedArrayBuffer` | no, no | yes, yes | no, no | yes, yes |
| OPFS available | yes | yes | yes | yes |
| `storage.persisted()` before, `persist()` result | false, false | false, false | false, false | false, false |
| `storage.estimate()` quota | 10.8 GB | 10.8 GB | 1.0 GB | 1.0 GB |
| `opfs-sahpool` | works | works | works | works |
| `OPFSCoopSyncVFS` | works | works | works | works |
| official `opfs` | does not install | works | does not install | 1 of 9 probes |
| official `opfs-wl` | does not install | works | does not install | 0 of 1 probe |

- `persist()` was refused in both headless browsers. What phones answer is the first thing to read off the demo page.
- The phone demo host was checked through its local port: both paths load, `.wasm` is served as `application/wasm`, scripts as `text/javascript`, and only `/coi/b/` sends the isolation headers. In Chromium all four layers behaved there as in the table.

## What broke, and why

1. **The stock wa-sqlite build has no FTS5.** The prebuilt files of `rhashimoto/wa-sqlite` 1.2.0 are compiled without it. The spike used the PowerSync fork's build (`@journeyapps/wa-sqlite` 2.0.10), which has FTS5 but also links PowerSync's own SQLite extension, is 28% larger (1.12 MB against 0.88 MB), ships SQLite 3.53.0, has no `dbstat`, and has no licence field in its `package.json`. Using `OPFSCoopSyncVFS` in production would mean our own Emscripten build. The layer itself lives in the project's `src/examples`, described there as not primarily meant for production.
2. **`OPFSCoopSyncVFS` rejects `journal_mode=truncate` and `persist`** ("disk I/O error"; it accepts off, memory, delete, wal). WAL needs exclusive locking, which removes its multi-connection support. So its safe configuration is the default, and its writes stay at 4–5 ms.
3. **WAL file growth.** With plain WAL the 15 MB import left a 26 MB WAL file, and it never shrank: 37.7 MB on disk, over the 30 MB budget. Fixed with `wal_autocheckpoint=128`, `journal_size_limit=1 MB` and a truncating checkpoint after bulk writes; the WAL then stays near 1 MB. All `opfs-sahpool` results above use that.
4. **`storage.estimate()` over-reports** (see "Size").
5. **The search index optimise step leaves 4.2 MB of free pages.** `VACUUM` removes them in 130–360 ms (1.1 s once for wa-sqlite in Chromium). Run it rarely, or skip the optimise step.
6. **First search after start-up in WebKit takes 131–157 ms** for a word in every scene, against 12–14 ms from the second run on. Splitting the query showed every part (ranking, snippets) is slow only the first time, so it is one-off compilation and cache warm-up, not query cost. Mitigation: recommendation 5.
7. **A long update log makes a document slow to open** (see the compaction curve). This drives the compaction rule.
8. **Official `opfs` / `opfs-wl`** fail on latency and were unreliable in Playwright WebKit (see above).
9. **Restore as a forward update** exceeds 100 ms for the 10,000-word scene (78–182 ms).

## Research claims checked against current documentation

| Claim (`editor-storage-tech.md`) | Result |
|---|---|
| `opfs-sahpool` needs no COOP/COEP, allows one connection | Confirmed in the SQLite documentation and in both browsers. |
| Official `opfs` needs the headers and Safari 17+ | Confirmed in the documentation; the header requirement confirmed in both browsers. |
| Not in the research: a third official layer | `opfs-wl` exists since SQLite 3.53 (Web Locks based, also needs the headers). Measured: slower than `opfs`. |
| Not in the research | `opfs-sahpool` gained `pauseVfs()` / `unpauseVfs()` in 3.50 for cooperative hand-over. |
| The canonical WASM build includes FTS5 | Confirmed with `PRAGMA compile_options`. Not true of the stock wa-sqlite build. |
| PowerSync recommends `OPFSCoopSyncVFS` (May 2026 review) | The article says "As of 2025"; the recommendation stands, with the note that Safari private mode has no OPFS and Chrome incognito limits databases to 100 MB. |
| FTS5 trigram tokenizer for substrings | Works, but costs more space than everything else together and is not needed at this size. |
| iOS quota, eviction, `persist()` heuristics | Not verifiable here. Phone checklist. |

## Dependencies and licences

| Package | Version | Licence | Use |
|---|---|---|---|
| `@sqlite.org/sqlite-wasm` | 3.54.1-build1 | Apache-2.0 (packaging); SQLite itself is public domain | official build, three of the four layers |
| `@journeyapps/wa-sqlite` | 2.0.10 | MIT (`LICENSE` file; no licence field in `package.json`) | wa-sqlite build with FTS5 and `OPFSCoopSyncVFS`; statically links PowerSync's SQLite core extension (Apache-2.0) |
| `yjs` | 13.6.33 | MIT | documents |
| `lib0`, `isomorphic.js` | 0.2.120, 0.2.5 | MIT | dependencies of Yjs |
| `vite` | 8.3.8 | MIT | build only |
| `typescript` | 5.9.3 | Apache-2.0 | build only |
| `playwright` | 1.64.1 | Apache-2.0 | automated runs only |

All are compatible with AGPL-3.0. Checked but not used: `rhashimoto/wa-sqlite` 1.2.0 (MIT), because its prebuilt files lack FTS5.

Download sizes of the storage code (gzip): official build 408 KB WASM; wa-sqlite build 519 KB WASM; the worker script that bundles both libraries and Yjs is 122 KB.

## Not measured

- Anything on a real phone: every threshold, iOS memory kills, swipe-away kills, lock and unlock, restart, storage eviction, `persist()`, quota, Safari private mode, Home Screen installation.
- Whether a storage handle survives a long suspension on iOS. The demo reloads itself after three failed write batches and records that in the kill log, so the phone test will show it.
- Power loss, and therefore the practical difference between `synchronous=normal` and `full`.
- Safari itself; Firefox; Android Chrome. Playwright's WebKit is not a substitute.
- Worker heap. The main-thread heap in Chromium was 10–13 MB with the project open.
- Projects larger than 300,000 words, and databases with many snapshots (one snapshot of all 600 documents adds about 2.2 MB).
- `opfs-sahpool` hand-over between tabs with `pauseVfs()`, and exporting the database file for backup.
- A wa-sqlite build of our own with FTS5.
- Flash write volume per hour of typing.

## Manual phone checklist

The demo is the same build, on the tailnet demo host at `/b/` (no isolation headers) and `/coi/b/` (with them). Run it at `/b/`; `/coi/b/` is only needed to confirm the environment table. On the iPhone, add the page to the Home Screen first and run everything from the Home Screen icon; on Android, use Chrome.

The page shows the environment report at the top, a results table with PASS/FAIL per threshold, and a "Copy results as JSON" button. Paste that JSON into this file's follow-up.

Per storage layer (`opfs-sahpool` first; `OPFSCoopSyncVFS` if time allows), per phone:

- [ ] Note the environment table: isolated or not, OPFS available, `persisted()` / `persist()`, `estimate()`, which layers work.
- [ ] Choose the layer, tap **Create 300,000-word fixture**, note the import time and size rows.
- [ ] Tap **Run all (about 7 min)** and leave the phone awake. Note every row of the results table.
- [ ] Choose "swipe the app away", tap **Start typing (kill test)**, wait a few seconds, read the two counters, swipe the app away, reopen. The page verifies, adds a row to the kill log and resumes. Repeat 20 times. Any row that is not "intact / ok", or a loss above 1,000 ms, is a failure.
- [ ] Choose "lock the phone for 10 minutes", lock, wait, unlock. If the page is still running, tap **Verify integrity now**; if it reloaded, read the new kill-log row.
- [ ] Choose "open heavy pages in other apps", open a dozen heavy pages elsewhere, return. Read the kill-log row.
- [ ] Choose "restart the phone", restart, reopen. Read the kill-log row.
- [ ] iPhone only: open `/b/` in a Safari private tab. Expected: a red "Storage unavailable" line and no working layer.
- [ ] Tap **Copy results as JSON** and keep the text.

Results:

| Phone, browser, layer | Tree ≤ 300 ms | Document ≤ 50 ms | Write p95 ≤ 20 ms | Search ≤ 150 ms | Regex ≤ 1.5 s | Size ≤ 30 MB | 20 kills: worst loss, corruption | Lock 10 min | Memory kill | Restart | Private tab | `persist()` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| iPhone (Home Screen), `opfs-sahpool` | | | | | | | | | | | | |
| iPhone (Home Screen), `OPFSCoopSyncVFS` | | | | | | | | | | | | |
| Android Chrome, `opfs-sahpool` | | | | | | | | | | | | |
| Android Chrome, `OPFSCoopSyncVFS` | | | | | | | | | | | | |

## Changes to propose in `PLAN.md`

- §5, database row: name `opfs-sahpool` with WAL and a per-project Web Lock; drop "Spike B decides" once the phone checklist passes.
- §5, search row: word index only; substring and regular-expression search by scan.
- §6: no budget needs changing on this evidence. Add a budget for opening a document that has an uncompacted log, or state the compaction rule there.
- No COOP/COEP headers are required by storage. If another part of the app ever needs them, storage is unaffected in Chromium; in WebKit start-up was 220–240 ms slower with them.
