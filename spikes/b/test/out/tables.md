## Thresholds

| Measure (ms unless noted) | Chromium plain, `opfs-sahpool` | Chromium plain, `OPFSCoopSyncVFS` | Chromium isolated, official `opfs` | Chromium isolated, official `opfs-wl` | Chromium isolated, `opfs-sahpool` | Chromium isolated, `OPFSCoopSyncVFS` | WebKit plain, `opfs-sahpool` | WebKit plain, `OPFSCoopSyncVFS` | WebKit isolated, `opfs-sahpool` | WebKit isolated, `OPFSCoopSyncVFS` |
|---|---|---|---|---|---|---|---|---|---|---|
| Tree loaded, from starting the worker (≤ 300 ms) | 223 (201–533) | 194 (169–215) | 437 (341–598) | 801 (698–826) | 230 (212–239) | 172 (168–174) | 263 (250–300) | 242 (229–272) | 312 (290–331) | 238 (235–263) |
| Tree loaded, from navigation start | 344 (327–910) | 311 (297–363) | 590 (498–855) | 1099 (909–1129) | 349 (333–357) | 300 (294–331) | 386 (368–440) | 358 (344–392) | 627 (619–656) | 580 (572–594) |
| First document after the tree (≤ 50 ms) | 42.2 (8.4–63.3) | 20.5 (11.3–52) | 15.9 (14.1–18) | 67.9 (64.7–81.5) | 11.7 (7.7–28.3) | 16.6 (10.8–19.4) | 10 (9–20) | 9 (9–25) | 9.5 (9.4–14.7) | 9.2 (9.1–9.5) |
| Document load, warm, median / p95 (≤ 50 ms) | 0.9 / 9.1 | 1.9 / 44.6 | 7.5 / 10.6 | 11.2 / 55.6 | 0.7 / 6.2 | 1 / 6.6 | 1 / 3 | 1 / 6 | 1 / 4.1 | 1.1 / 3.9 |
| Document load, 10,000-word scene, median | 3.5 | 2.6 | 8.4 | 10.9 | 2.6 | 2 | 3 | 4 | 2.8 | 3.4 |
| Write batch in the worker, p95 / max (≤ 20 ms) | 2.1 / 45.3 (n=999) | 6.3 / 39.8 (n=1000) | 111 / 282 (n=975) | 155 / 281 (n=911) | 2.6 / 8.3 (n=200) | 6 / 11.7 (n=200) | 1 / 11 (n=1000) | 7 / 18 (n=1000) | 0.7 / 8.1 (n=200) | 7 / 7.8 (n=200) |
| Change sent to change durable, p95 / max (≤ 500 ms) | 252 / 314 | 256 / 302 | 357 / 698 | 479 / 673 | 251 / 259 | 256 / 306 | 251 / 265 | 257 / 270 | 251 / 266 | 257 / 272 |
| Main thread: per change p95; timer drift p95 / max | 0.4; 0.2 / 64.4 | 0.3; 0.1 / 6.8 | 0.4; 0.9 / 11.3 | 0.4; 1.4 / 7.2 | 0.3; 0.1 / 0.3 | 0.3; 0.1 / 0.6 | 1; 1 / 5 | 0; 4 / 5 | 0.5; 0.8 / 0.9 | 0.4; 1.6 / 1.6 |
| Word search, common word, first 20 with snippets, p95 (≤ 150 ms) | 46.1 | 55.7 | 25.8 | 64.6 | 19.3 | 21.4 | 157 | 131 | 134 | 127 |
| Word search, rare word, p95 | 0.9 | 1.4 | 5.1 | 44.6 | 0.9 | 1 | 1 | 11 | 1 | 1.2 |
| Phrase search, p95 (≤ 150 ms) | 0.8 | 1.5 | 5.2 | 22 | 0.8 | 1.2 | 1 | 4 | 0.9 | 1 |
| Substring, trigram index, p95 | 7.2 | 4.7 | 8.8 | 55.4 | 4 | 4.1 | 4 | 5 | 4.3 | 4.5 |
| Substring, LIKE scan without index, median / p95 | 6.5 / 24.6 | 16.2 / 46.2 | 9.2 / 26.6 | 13 / 42.4 | 6.4 / 13.3 | 13.6 / 17.4 | 7 / 10 | 15 / 17 | 6.5 / 14.1 | 14.6 / 16.8 |
| Regular-expression scan, median / p95 (≤ 1,500 ms) | 8 / 9.7 | 17.9 / 61.1 | 11 / 13 | 13.1 / 38.1 | 7.8 / 9.7 | 13.5 / 16.9 | 10 / 12 | 15 / 20 | 10.5 / 12.4 | 15.2 / 23 |
| Search hit counts as planted | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Stored size after import, on disk, MB (≤ 30) | 15.49 | 15.31 | 15.46 | 15.46 | 15.49 | 15.31 | 15.48 | 15.30 | 15.48 | 15.30 |
| Stored size after VACUUM, on disk, MB | 11.23 | 11.07 | 11.20 | 11.20 | 11.23 | 11.07 | 11.22 | 11.06 | 11.22 | 11.06 |
| Snapshot one document, median / max (≤ 50 ms) | 0.8 / 1.8 | 3.4 / 43.2 | 17.8 / 20.1 | 20 / 21.3 | 0.5 / 1.7 | 3 / 3.5 | 1 / 1 | 4 / 7 | 0.5 / 3.2 | 3.8 / 5.4 |
| Snapshot the 10,000-word scene, median / max | 1.9 / 3.7 | 8.9 / 69.4 | 24.3 / 166 | 25.3 / 31.2 | 13.1 / 16.4 | 4.3 / 5.7 | 2 / 3 | 6 / 7 | 11.4 / 12.9 | 5.6 / 6.4 |
| Restore (replace) and reload, median / max (≤ 100 ms) | 5.9 / 29.8 | 8.1 / 26.5 | 91.8 / 481 | 48.3 / 233 | 3.8 / 11.8 | 7 / 11.2 | 2 / 22 | 8 / 17 | 4.7 / 10.5 | 6.7 / 10.6 |
| Restore (replace), 10,000-word scene, median / max | 49.7 / 72.1 | 39.3 / 164 | 211 / 261 | 98.3 / 131 | 32.6 / 34 | 37.5 / 40.5 | 50 / 74 | 39 / 64 | 32 / 40.1 | 37.2 / 56.5 |
| Restore (forward update) and reload, median / max | 29.6 / 49.6 | 26.8 / 90.3 | 85.1 / 209 | 64.3 / 89.5 | 13.3 / 19.2 | 17.3 / 23.3 | 17 / 34 | 20 / 23 | 19.8 / 21.2 | 21 / 29.6 |
| Restore (forward), 10,000-word scene, median / max | 78.1 / 145 | 89.5 / 215 | 266 / 750 | 156 / 358 | 61.8 / 91.2 | 64 / 102 | 182 / 213 | 86 / 96 | 71.5 / 92.5 | 81 / 99 |
| Restored text correct | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Snapshot all 600 documents, ms | 81 | 44 | 356 | 63 | 50 | 41 | 105 | 40 | 40 | 33 |
| Import, ms (Yjs encode + SQL + commit) | 1794 | 1596 | 1111 | 2968 | 1060 | 1046 | 1152 | 1089 | 1149 | 1097 |
| Index optimise after import, ms | 245 | 340 | 1034 | 3282 | 220 | 251 | 168 | 204 | 171 | 204 |
| Typing run verified by replay; integrity check at end | ok; ok | ok; ok | ok; ok | ok; ok | ok; ok | ok; ok | ok; ok | ok; ok | ok; ok | ok; ok |
| Typing run length, s | 300 | 300 | 300 | 300 | 60 | 60 | 300 | 300 | 60 | 60 |
| CPU calibration during typing, median / max, ms (host load at start) | 32 / 188 (2.74 1.60) | 42.8 / 55.9 (1.53 1.34) | 32.2 / 80.8 (2.42 1.20) | 42.6 / 104 (4.84 2.64) | 47.8 / 51.1 (0.79 1.73) | 49.1 / 51.9 (0.61 1.43) | 15 / 17 (1.92 1.48) | 15 / 16 (1.09 0.89) | 15.3 / 16.3 (0.76 0.57) | 16.3 / 17.7 (0.93 0.62) |

## Size split after import (MB)

| Part | Chromium plain, `opfs-sahpool` | Chromium plain, `OPFSCoopSyncVFS` | Chromium isolated, official `opfs` | Chromium isolated, official `opfs-wl` | Chromium isolated, `opfs-sahpool` | Chromium isolated, `OPFSCoopSyncVFS` | WebKit plain, `opfs-sahpool` | WebKit plain, `OPFSCoopSyncVFS` | WebKit isolated, `opfs-sahpool` | WebKit isolated, `OPFSCoopSyncVFS` |
|---|---|---|---|---|---|---|---|---|---|---|
| SQLite version, page size | 3.54.1, 8192 | 3.53.0, 4096 | 3.54.1, 8192 | 3.54.1, 8192 | 3.54.1, 8192 | 3.53.0, 4096 | 3.54.1, 8192 | 3.53.0, 4096 | 3.54.1, 8192 | 3.53.0, 4096 |
| Journal, synchronous | wal, 1 | delete, 2 | truncate, 2 | truncate, 2 | wal, 1 | delete, 2 | wal, 1 | delete, 2 | wal, 1 | delete, 2 |
| Document states (Yjs), payload | 2.19 | 2.19 | 2.19 | 2.19 | 2.19 | 2.19 | 2.19 | 2.19 | 2.19 | 2.19 |
| Update log, payload | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Plain text for search, payload | 2.06 | 2.06 | 2.06 | 2.06 | 2.06 | 2.06 | 2.06 | 2.06 | 2.06 | 2.06 |
| Word index, payload | 0.87 | 0.87 | 0.87 | 0.87 | 0.87 | 0.87 | 0.87 | 0.87 | 0.87 | 0.87 |
| Trigram index, payload | 5.12 | 5.12 | 5.12 | 5.12 | 5.12 | 5.12 | 5.12 | 5.12 | 5.12 | 5.12 |
| Document states, pages (dbstat) | 2.55 | – | 2.55 | 2.55 | 2.55 | – | 2.55 | – | 2.55 | – |
| Plain text, pages | 2.38 | – | 2.38 | 2.38 | 2.38 | – | 2.38 | – | 2.38 | – |
| Word index, pages | 0.91 | – | 0.91 | 0.91 | 0.91 | – | 0.91 | – | 0.91 | – |
| Trigram index, pages | 5.24 | – | 5.24 | 5.24 | 5.24 | – | 5.24 | – | 5.24 | – |
| Tree, pages | 0.08 | – | 0.08 | 0.08 | 0.08 | – | 0.08 | – | 0.08 | – |
| Database file after import (free pages inside) | 15.46 (4.22) | 15.30 (4.23) | 15.46 (4.22) | 15.46 (4.22) | 15.46 (4.22) | 15.30 (4.23) | 15.46 (4.22) | 15.30 (4.23) | 15.46 (4.22) | 15.30 (4.23) |
| Database file after VACUUM | 11.20 | 11.06 | 11.20 | 11.20 | 11.20 | 11.06 | 11.20 | 11.06 | 11.20 | 11.06 |
| OPFS bytes on disk after import / after VACUUM | 15.49 / 11.23 | 15.31 / 11.07 | 15.46 / 11.20 | 15.46 / 11.20 | 15.49 / 11.23 | 15.31 / 11.07 | 15.48 / 11.22 | 15.30 / 11.06 | 15.48 / 11.22 | 15.30 / 11.06 |
| storage.estimate() usage after import / after VACUUM | 37.75 / 37.75 | 18.88 / 50.33 | 15.46 / 11.20 | 15.46 / 11.20 | 37.75 / 37.75 | 18.88 / 50.33 | 37.75 / 37.75 | 18.87 / 50.33 | 37.75 / 37.75 | 18.87 / 50.33 |
| storage.estimate() quota, MB | 10775 | 10756 | 10753 | 10753 | 10775 | 10756 | 1049 | 1049 | 1049 | 1049 |

## Typing run: growth and compaction

| Measure | Chromium plain, `opfs-sahpool` | Chromium plain, `OPFSCoopSyncVFS` | Chromium isolated, official `opfs` | Chromium isolated, official `opfs-wl` | Chromium isolated, `opfs-sahpool` | Chromium isolated, `OPFSCoopSyncVFS` | WebKit plain, `opfs-sahpool` | WebKit plain, `OPFSCoopSyncVFS` | WebKit isolated, `opfs-sahpool` | WebKit isolated, `OPFSCoopSyncVFS` |
|---|---|---|---|---|---|---|---|---|---|---|
| Changes written | 3000 | 3000 | 3000 | 3000 | 600 | 600 | 3000 | 3000 | 600 | 600 |
| Batches; changes per batch (median) | 999; 3 | 1000; 3 | 975; 3 | 911; 3 | 200; 3 | 200; 3 | 1000; 3 | 1000; 3 | 200; 3 | 200; 3 |
| Batch latency median / p95 / max, ms | 0.3 / 2.1 / 45.3 | 4.2 / 6.3 / 39.8 | 17.7 / 111 / 282 | 23.3 / 155 / 281 | 0.4 / 2.6 / 8.3 | 4.2 / 6 / 11.7 | 0 / 1 / 11 | 4 / 7 / 18 | 0.3 / 0.7 / 8.1 | 5.1 / 7 / 7.8 |
| Yjs update size median / max, bytes | 12 / 27 | 12 / 27 | 12 / 27 | 12 / 27 | 12 / 27 | 12 / 27 | 12 / 27 | 12 / 27 | 12 / 27 | 12 / 27 |
| Update log after the run: rows, KB payload | 3000, 37.3 | 3000, 37.3 | 3000, 37.3 | 3000, 37.3 | 600, 7.3 | 600, 7.3 | 3000, 37.3 | 3000, 37.3 | 600, 7.3 | 600, 7.3 |
| Database file before / after typing, MB | 11.20 / 11.31 | 11.06 / 11.18 | 11.20 / 11.31 | 11.20 / 11.31 | 11.20 / 11.22 | 11.06 / 11.09 | 11.20 / 11.31 | 11.06 / 11.18 | 11.20 / 11.22 | 11.06 / 11.09 |
| OPFS bytes on disk after typing, MB | 12.49 | 11.22 | 11.33 | 11.33 | 12.29 | 11.11 | 12.59 | 11.19 | 12.29 | 11.09 |
| Scene state + log before compaction, KB | 38.2 | 38.2 | 38.2 | 38.2 | 8.1 | 8.1 | 38.2 | 38.2 | 8.1 | 8.1 |
| Scene state after compaction, KB | 10.1 | 10.1 | 10.1 | 10.1 | 2.6 | 2.6 | 10.1 | 10.1 | 2.6 | 2.6 |
| Compaction of that log, ms (Yjs / reindex) | 153 (111 / 4.5) | 112 (77.7 / 3.8) | 268 (80.6 / 39.7) | 202 (62.2 / 24.4) | 49.6 (35.7 / 2.8) | 54.2 (37.2 / 3) | 155 (113 / 4) | 125 (94 / 5) | 85.3 (69.5 / 3.4) | 64 (45.7 / 3.9) |
| Database file after compaction, MB (free inside) | 11.33 (0.06) | 11.19 (0.09) | 11.33 (0.06) | 11.33 (0.06) | 11.23 (0.00) | 11.09 (0.02) | 11.33 (0.06) | 11.19 (0.09) | 11.23 (0.00) | 11.09 (0.02) |

## Compaction curve

**Chromium plain, `opfs-sahpool`**

| Scene | Updates in log | Load with log, ms | Load after, ms | State + log, KB | Compacted, KB | mergeUpdates result, KB | Compaction, ms | of which Yjs | of which reindex | mergeUpdates alone, ms |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 100 | 3.3 | 1.4 | 8.3 | 7.5 | 7.8 | 14.4 | 2.8 | 4.6 | 8.3 |
| typical | 500 | 18.7 | 3.4 | 17.4 | 9.3 | 12.5 | 37.7 | 25.4 | 3.7 | 15.9 |
| typical | 1000 | 25.9 | 1.6 | 29.5 | 13.1 | 19.7 | 45 | 24.8 | 4.3 | 59 |
| typical | 3000 | 105 | 3.3 | 74.7 | 26.5 | 45.0 | 83.5 | 57.9 | 4.8 | 347 |
| 10,000 words | 100 | 3.9 | 1.1 | 74.5 | 73.7 | 74.0 | 73.9 | 7.7 | 28.4 | 4.3 |
| 10,000 words | 500 | 10.5 | 2.6 | 83.6 | 75.6 | 78.7 | 50 | 14 | 23 | 14.2 |
| 10,000 words | 1000 | 22.7 | 2.9 | 95.7 | 79.3 | 85.9 | 95.2 | 31.5 | 23.4 | 50 |
| 10,000 words | 3000 | 66.1 | 3.3 | 140.4 | 91.9 | 110.7 | 115 | 66.6 | 26.4 | 356 |

**Chromium plain, `OPFSCoopSyncVFS`**

| Scene | Updates in log | Load with log, ms | Load after, ms | State + log, KB | Compacted, KB | mergeUpdates result, KB | Compaction, ms | of which Yjs | of which reindex | mergeUpdates alone, ms |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 100 | 2.3 | 0.5 | 8.3 | 7.5 | 7.8 | 11.7 | 2.9 | 2.2 | 1.9 |
| typical | 500 | 10.8 | 0.8 | 17.4 | 9.3 | 12.5 | 26.1 | 13.1 | 2.9 | 13 |
| typical | 1000 | 17.4 | 1.3 | 29.5 | 13.1 | 19.7 | 46 | 19 | 2.7 | 51 |
| typical | 3000 | 89.4 | 5.2 | 74.7 | 26.5 | 45.0 | 122 | 94.9 | 3.9 | 398 |
| 10,000 words | 100 | 2.8 | 1.5 | 74.5 | 73.7 | 74.0 | 116 | 6.6 | 41.9 | 29.2 |
| 10,000 words | 500 | 9.3 | 1.7 | 83.6 | 75.6 | 78.7 | 86.4 | 11.6 | 55.7 | 15.3 |
| 10,000 words | 1000 | 30.7 | 2.2 | 95.7 | 79.3 | 85.9 | 69.6 | 19.2 | 25.9 | 72 |
| 10,000 words | 3000 | 78.7 | 4.2 | 140.4 | 91.9 | 110.7 | 173 | 94.9 | 23.4 | 405 |

**Chromium isolated, official `opfs`**

| Scene | Updates in log | Load with log, ms | Load after, ms | State + log, KB | Compacted, KB | mergeUpdates result, KB | Compaction, ms | of which Yjs | of which reindex | mergeUpdates alone, ms |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 100 | 6.8 | 4.3 | 8.3 | 7.5 | 7.8 | 91.7 | 2.9 | 32.2 | 2 |
| typical | 500 | 14.7 | 7.7 | 17.4 | 9.3 | 12.5 | 101 | 13.1 | 12.9 | 13.9 |
| typical | 1000 | 48.2 | 5.3 | 27.6 | 12.9 | 18.7 | 142 | 20.2 | 13.7 | 41.9 |
| typical | 3000 | 83.1 | 5.9 | 74.4 | 26.2 | 44.8 | 208 | 68.6 | 13.8 | 304 |
| 10,000 words | 100 | 6.3 | 4.8 | 74.5 | 73.7 | 74.0 | 314 | 7 | 70 | 4.3 |
| 10,000 words | 500 | 12.7 | 5.3 | 83.6 | 75.6 | 78.7 | 144 | 10.4 | 31.1 | 13.2 |
| 10,000 words | 1000 | 21.2 | 11.1 | 95.7 | 79.3 | 85.9 | 202 | 18.2 | 44.9 | 41.9 |
| 10,000 words | 3000 | 59.6 | 6.9 | 140.4 | 91.9 | 110.7 | 277 | 65.2 | 50.8 | 334 |

**Chromium isolated, official `opfs-wl`**

| Scene | Updates in log | Load with log, ms | Load after, ms | State + log, KB | Compacted, KB | mergeUpdates result, KB | Compaction, ms | of which Yjs | of which reindex | mergeUpdates alone, ms |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 100 | 6.6 | 4.9 | 8.3 | 7.5 | 7.8 | 62.4 | 2.8 | 20.6 | 2.1 |
| typical | 500 | 15.3 | 4.9 | 17.4 | 9.3 | 12.5 | 77.1 | 14.2 | 12.8 | 14.6 |
| typical | 1000 | 24.4 | 5.5 | 29.5 | 13.1 | 19.7 | 129 | 19.7 | 13 | 39.2 |
| typical | 3000 | 62.4 | 6.4 | 74.7 | 26.5 | 45.0 | 167 | 53.5 | 13.4 | 296 |
| 10,000 words | 100 | 7.1 | 5.3 | 74.5 | 73.7 | 74.0 | 207 | 4.9 | 58.9 | 3.4 |
| 10,000 words | 500 | 13.5 | 5.5 | 83.6 | 75.6 | 78.7 | 130 | 10.4 | 30.1 | 12.2 |
| 10,000 words | 1000 | 22.9 | 5.8 | 95.7 | 79.3 | 85.9 | 183 | 20.5 | 39.9 | 39.4 |
| 10,000 words | 3000 | 59.9 | 7.3 | 140.4 | 91.9 | 110.7 | 243 | 50.2 | 50.6 | 310 |

**Chromium isolated, `opfs-sahpool`**

| Scene | Updates in log | Load with log, ms | Load after, ms | State + log, KB | Compacted, KB | mergeUpdates result, KB | Compaction, ms | of which Yjs | of which reindex | mergeUpdates alone, ms |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 100 | 2.8 | 0.8 | 8.3 | 7.5 | 7.8 | 10.1 | 3.8 | 2.5 | 2.4 |
| typical | 500 | 11.3 | 0.7 | 17.4 | 9.3 | 12.5 | 19.9 | 12.8 | 2.2 | 12.8 |
| typical | 1000 | 20 | 0.9 | 29.5 | 13.1 | 19.7 | 27.6 | 18.6 | 2.4 | 39.7 |
| typical | 3000 | 60.4 | 2.7 | 74.7 | 26.5 | 45.0 | 84 | 49.1 | 3.3 | 293 |
| 10,000 words | 100 | 3 | 1.1 | 74.5 | 73.7 | 74.0 | 31.2 | 4.8 | 18.6 | 3.4 |
| 10,000 words | 500 | 9.6 | 1.3 | 83.6 | 75.6 | 78.7 | 63 | 10.2 | 18.9 | 13 |
| 10,000 words | 1000 | 19.7 | 1.6 | 95.7 | 79.3 | 85.9 | 48.2 | 18.3 | 18.8 | 41 |
| 10,000 words | 3000 | 54.3 | 5.2 | 140.4 | 91.9 | 110.7 | 102 | 47.9 | 21.1 | 288 |

**Chromium isolated, `OPFSCoopSyncVFS`**

| Scene | Updates in log | Load with log, ms | Load after, ms | State + log, KB | Compacted, KB | mergeUpdates result, KB | Compaction, ms | of which Yjs | of which reindex | mergeUpdates alone, ms |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 100 | 2.7 | 0.7 | 8.3 | 7.5 | 7.8 | 12.6 | 2.9 | 2.5 | 2 |
| typical | 500 | 10.8 | 0.8 | 17.4 | 9.3 | 12.5 | 24.3 | 12.7 | 2.6 | 13 |
| typical | 1000 | 18.1 | 1.1 | 29.5 | 13.1 | 19.7 | 31.8 | 18.6 | 2.6 | 39.1 |
| typical | 3000 | 53 | 3.5 | 74.7 | 26.5 | 45.0 | 81.4 | 51.6 | 3.8 | 288 |
| 10,000 words | 100 | 2.9 | 1.1 | 74.5 | 73.7 | 74.0 | 38.6 | 4.5 | 19.3 | 3.3 |
| 10,000 words | 500 | 8.6 | 1.6 | 83.6 | 75.6 | 78.7 | 54.4 | 9.9 | 18.8 | 11.9 |
| 10,000 words | 1000 | 16.6 | 1.9 | 95.7 | 79.3 | 85.9 | 56.2 | 18.3 | 18.7 | 39.2 |
| 10,000 words | 3000 | 49.9 | 3.3 | 140.4 | 91.9 | 110.7 | 100 | 51.9 | 19.4 | 288 |

**WebKit plain, `opfs-sahpool`**

| Scene | Updates in log | Load with log, ms | Load after, ms | State + log, KB | Compacted, KB | mergeUpdates result, KB | Compaction, ms | of which Yjs | of which reindex | mergeUpdates alone, ms |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 100 | 15 | 1 | 8.3 | 7.5 | 7.8 | 32 | 11 | 2 | 44 |
| typical | 500 | 75 | 8 | 17.4 | 9.3 | 12.5 | 116 | 86 | 6 | 88 |
| typical | 1000 | 105 | 3 | 29.5 | 13.1 | 19.7 | 115 | 83 | 2 | 189 |
| typical | 3000 | 195 | 5 | 74.7 | 26.5 | 45.0 | 222 | 183 | 8 | 311 |
| 10,000 words | 100 | 5 | 2 | 74.5 | 73.7 | 74.0 | 59 | 6 | 24 | 8 |
| 10,000 words | 500 | 16 | 3 | 83.6 | 75.6 | 78.7 | 50 | 18 | 24 | 14 |
| 10,000 words | 1000 | 34 | 3 | 95.7 | 79.3 | 85.9 | 127 | 69 | 32 | 36 |
| 10,000 words | 3000 | 76 | 5 | 140.4 | 91.9 | 110.7 | 128 | 80 | 21 | 304 |

**WebKit plain, `OPFSCoopSyncVFS`**

| Scene | Updates in log | Load with log, ms | Load after, ms | State + log, KB | Compacted, KB | mergeUpdates result, KB | Compaction, ms | of which Yjs | of which reindex | mergeUpdates alone, ms |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 100 | 8 | 1 | 8.3 | 7.5 | 7.8 | 75 | 6 | 7 | 3 |
| typical | 500 | 61 | 11 | 17.4 | 9.3 | 12.5 | 76 | 17 | 3 | 9 |
| typical | 1000 | 101 | 2 | 29.5 | 13.1 | 19.7 | 254 | 156 | 15 | 136 |
| typical | 3000 | 242 | 5 | 74.7 | 26.5 | 45.0 | 313 | 286 | 3 | 404 |
| 10,000 words | 100 | 5 | 3 | 74.5 | 73.7 | 74.0 | 53 | 6 | 28 | 4 |
| 10,000 words | 500 | 14 | 3 | 83.6 | 75.6 | 78.7 | 58 | 16 | 21 | 17 |
| 10,000 words | 1000 | 22 | 3 | 95.7 | 79.3 | 85.9 | 60 | 26 | 15 | 31 |
| 10,000 words | 3000 | 68 | 6 | 140.4 | 91.9 | 110.7 | 160 | 104 | 22 | 292 |

**WebKit isolated, `opfs-sahpool`**

| Scene | Updates in log | Load with log, ms | Load after, ms | State + log, KB | Compacted, KB | mergeUpdates result, KB | Compaction, ms | of which Yjs | of which reindex | mergeUpdates alone, ms |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 100 | 5 | 1.6 | 8.3 | 7.5 | 7.8 | 13.3 | 5.8 | 3.1 | 2.3 |
| typical | 500 | 19.2 | 1.4 | 17.4 | 9.3 | 12.5 | 64.7 | 56.4 | 2.5 | 23.3 |
| typical | 1000 | 26.5 | 2.2 | 29.5 | 13.1 | 19.7 | 39.7 | 28.5 | 3 | 29.3 |
| typical | 3000 | 76.8 | 4.3 | 74.7 | 26.5 | 45.0 | 118 | 80.6 | 3.2 | 221 |
| 10,000 words | 100 | 4.3 | 2.2 | 74.5 | 73.7 | 74.0 | 26.1 | 5 | 15.4 | 3.6 |
| 10,000 words | 500 | 14.1 | 3 | 83.6 | 75.6 | 78.7 | 67.7 | 15.5 | 19.9 | 11.5 |
| 10,000 words | 1000 | 37.5 | 3.2 | 93.8 | 79.1 | 84.9 | 80.2 | 52.8 | 15.8 | 67.8 |
| 10,000 words | 3000 | 80.4 | 5.2 | 140.2 | 91.7 | 110.5 | 151 | 98.7 | 16.6 | 205 |

**WebKit isolated, `OPFSCoopSyncVFS`**

| Scene | Updates in log | Load with log, ms | Load after, ms | State + log, KB | Compacted, KB | mergeUpdates result, KB | Compaction, ms | of which Yjs | of which reindex | mergeUpdates alone, ms |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 100 | 4 | 0.7 | 8.3 | 7.5 | 7.8 | 23.8 | 10.2 | 3 | 2.9 |
| typical | 500 | 18.3 | 1.4 | 17.4 | 9.3 | 12.5 | 56.1 | 44.1 | 2.4 | 16.1 |
| typical | 1000 | 24.4 | 3.3 | 29.5 | 13.1 | 19.7 | 48.1 | 31.7 | 2.9 | 28.7 |
| typical | 3000 | 68.6 | 3.8 | 74.7 | 26.5 | 45.0 | 137 | 108 | 3.2 | 213 |
| 10,000 words | 100 | 3.8 | 2 | 74.5 | 73.7 | 74.0 | 35.6 | 5.6 | 16.9 | 3.4 |
| 10,000 words | 500 | 12.5 | 2.8 | 83.6 | 75.6 | 78.7 | 58.5 | 16.1 | 18.2 | 11 |
| 10,000 words | 1000 | 43 | 2.8 | 95.7 | 79.3 | 85.9 | 104 | 65.6 | 17 | 67.9 |
| 10,000 words | 3000 | 66.6 | 5.3 | 140.4 | 91.9 | 110.7 | 133 | 92.3 | 16.5 | 211 |

## Index variants

**Chromium plain, `opfs-sahpool`**

| Variant | Index size, MB | Build, ms | Substring query (LIKE through the index), ms |
|---|---|---|---|
| word detail=full | 0.88 | 121 | – |
| word detail=column | 0.58 | 92.1 | – |
| word detail=none | 0.26 | 82.7 | – |
| trigram detail=full | 5.16 | 843 | 2.6 |
| trigram detail=column | 2.03 | 766 | 3.4 |
| trigram detail=none | 0.70 | 423 | 3.2 |

**Chromium plain, `OPFSCoopSyncVFS`**

| Variant | Index size, MB | Build, ms | Substring query (LIKE through the index), ms |
|---|---|---|---|
| word detail=full | 0.88 | 129 | – |
| word detail=column | 0.58 | 85 | – |
| word detail=none | 0.26 | 69.7 | – |
| trigram detail=full | 5.16 | 727 | 1.7 |
| trigram detail=column | 2.03 | 439 | 5.6 |
| trigram detail=none | 0.70 | 301 | 5.7 |

**Chromium isolated, official `opfs`**

| Variant | Index size, MB | Build, ms | Substring query (LIKE through the index), ms |
|---|---|---|---|
| word detail=full | 0.88 | 836 | – |
| word detail=column | 0.58 | 698 | – |
| word detail=none | 0.26 | 653 | – |
| trigram detail=full | 5.16 | 4544 | 3.9 |
| trigram detail=column | 2.03 | 1693 | 8.7 |
| trigram detail=none | 0.70 | 1071 | 52.6 |

**Chromium isolated, official `opfs-wl`**

| Variant | Index size, MB | Build, ms | Substring query (LIKE through the index), ms |
|---|---|---|---|
| word detail=full | 0.88 | 173 | – |
| word detail=column | 0.58 | 124 | – |
| word detail=none | 0.26 | 123 | – |
| trigram detail=full | 5.16 | 1086 | 3.7 |
| trigram detail=column | 2.03 | 468 | 4.9 |
| trigram detail=none | 0.70 | 314 | 4.7 |

**Chromium isolated, `opfs-sahpool`**

| Variant | Index size, MB | Build, ms | Substring query (LIKE through the index), ms |
|---|---|---|---|
| word detail=full | 0.88 | 102 | – |
| word detail=column | 0.58 | 73.4 | – |
| word detail=none | 0.26 | 50 | – |
| trigram detail=full | 5.15 | 627 | 1.4 |
| trigram detail=column | 2.03 | 400 | 2.8 |
| trigram detail=none | 0.70 | 240 | 2.6 |

**Chromium isolated, `OPFSCoopSyncVFS`**

| Variant | Index size, MB | Build, ms | Substring query (LIKE through the index), ms |
|---|---|---|---|
| word detail=full | 0.88 | 121 | – |
| word detail=column | 0.58 | 76.8 | – |
| word detail=none | 0.26 | 64.2 | – |
| trigram detail=full | 5.15 | 689 | 2.1 |
| trigram detail=column | 2.03 | 417 | 5.1 |
| trigram detail=none | 0.70 | 259 | 4.5 |

**WebKit plain, `opfs-sahpool`**

| Variant | Index size, MB | Build, ms | Substring query (LIKE through the index), ms |
|---|---|---|---|
| word detail=full | 0.88 | 150 | – |
| word detail=column | 0.58 | 96 | – |
| word detail=none | 0.26 | 53 | – |
| trigram detail=full | 5.16 | 496 | 1 |
| trigram detail=column | 2.03 | 343 | 3 |
| trigram detail=none | 0.70 | 210 | 3 |

**WebKit plain, `OPFSCoopSyncVFS`**

| Variant | Index size, MB | Build, ms | Substring query (LIKE through the index), ms |
|---|---|---|---|
| word detail=full | 0.88 | 116 | – |
| word detail=column | 0.58 | 67 | – |
| word detail=none | 0.26 | 62 | – |
| trigram detail=full | 5.16 | 595 | 1 |
| trigram detail=column | 2.03 | 371 | 5 |
| trigram detail=none | 0.70 | 236 | 5 |

**WebKit isolated, `opfs-sahpool`**

| Variant | Index size, MB | Build, ms | Substring query (LIKE through the index), ms |
|---|---|---|---|
| word detail=full | 0.88 | 102 | – |
| word detail=column | 0.58 | 59.6 | – |
| word detail=none | 0.26 | 42.4 | – |
| trigram detail=full | 5.15 | 504 | 1 |
| trigram detail=column | 2.03 | 332 | 2.6 |
| trigram detail=none | 0.70 | 224 | 2.7 |

**WebKit isolated, `OPFSCoopSyncVFS`**

| Variant | Index size, MB | Build, ms | Substring query (LIKE through the index), ms |
|---|---|---|---|
| word detail=full | 0.88 | 118 | – |
| word detail=column | 0.58 | 69.1 | – |
| word detail=none | 0.26 | 65.4 | – |
| trigram detail=full | 5.15 | 612 | 1.4 |
| trigram detail=column | 2.03 | 368 | 5.2 |
| trigram detail=none | 0.70 | 238 | 4.5 |

## Cold open breakdown

| Chromium, median (min–max) of 10 cold starts | `opfs-sahpool` | `OPFSCoopSyncVFS` |
|---|---|---|
| navToTreeMs | 344 (327–910) | 311 (297–363) |
| navToFirstDocMs | 383 (339–973) | 346 (314–384) |
| workerStartToTreeMs | 223 (201–533) | 194 (169–215) |
| initMs | 107 (101–302) | 88.7 (77.5–97.8) |
| wasmInitMs | 60 (54.7–144) | 26.1 (23–34.2) |
| vfsInstallMs | 11.2 (9.8–62.6) | 15.7 (13.5–29.5) |
| dbOpenMs | 5.5 (5.3–8.5) | 12 (11–12.9) |
| pragmaMs | 27.1 (25.3–84) | 0.1 (0–0.2) |
| schemaMs | 2.2 (1.6–6.5) | 31.2 (29.1–34.1) |
| treeQueryMs | 42.3 (31.7–99.6) | 26.3 (22.8–40.4) |
| firstDocMs | 42.2 (8.4–63.3) | 20.5 (11.3–52) |
| warmTypicalDocMedianMs | 0.9 (0.7–2) | 1 (0.9–1.1) |
| warmTypicalDocP95Ms | 7.2 (2.6–52.9) | 6.8 (2.8–8.7) |
| warmBigDocMedianMs | 2.2 (1.9–6.9) | 2.7 (1.9–4.7) |
| failures | 0 | 0 |

| WebKit, median (min–max) of 10 cold starts | `opfs-sahpool` | `OPFSCoopSyncVFS` |
|---|---|---|
| navToTreeMs | 386 (368–440) | 358 (344–392) |
| navToFirstDocMs | 406 (377–449) | 367 (353–405) |
| workerStartToTreeMs | 263 (250–300) | 242 (229–272) |
| initMs | 153 (133–190) | 138 (122–171) |
| wasmInitMs | 110 (100–155) | 87 (51–94) |
| vfsInstallMs | 12 (8–17) | 21 (11–45) |
| dbOpenMs | 4 (3–7) | 14 (8–44) |
| pragmaMs | 10 (6–33) | 0 (0–1) |
| schemaMs | 5 (3–25) | 15 (11–47) |
| treeQueryMs | 35 (25–60) | 22 (15–46) |
| firstDocMs | 10 (9–20) | 9 (9–25) |
| warmTypicalDocMedianMs | 1 (1–1) | 1 (1–1) |
| warmTypicalDocP95Ms | 4 (3–7) | 4 (3–9) |
| warmBigDocMedianMs | 3 (2–3) | 4 (3–5) |
| failures | 0 | 0 |

## Pragmas and batch interval

**Chromium**, 20 s of typing per run, 3 interleaved rounds

| Layer | Profile | Journal, sync | Batch interval, ms | Batch median per run, ms | Batch p95 per run, ms | Batch max per run, ms | Durable lag p95, ms | CPU calibration, ms |
|---|---|---|---|---|---|---|---|---|
| `opfs-sahpool` | default | delete, 2 | 250 | 5.4, 5.4, 5.3 | 15.9, 9.6, 7.5 | 48.9, 23.6, 12.2 | 258 | 36.3, 33.4, 32.7 |
| `opfs-sahpool` | truncate | truncate, 2 | 250 | 5.1, 5.2, 4.9 | 8, 9.1, 7.5 | 11.6, 46.1, 11 | 257 | 32.2, 32.1, 35.8 |
| `opfs-sahpool` | wal-limit | wal, 1 | 250 | 0.3, 0.5, 0.4 | 0.5, 4.5, 0.6 | 4.2, 10, 4.5 | 251 | 32.4, 34.1, 32 |
| `OPFSCoopSyncVFS` | default | delete, 2 | 250 | 4.1, 5.1, 4.2 | 5.9, 8.3, 6.3 | 11, 13.7, 10.1 | 256 | 32, 32.6, 32 |
| `OPFSCoopSyncVFS` | sync-normal | delete, 1 | 250 | 3.7, 3.8, 3.7 | 6.3, 6.2, 6.1 | 11.4, 8.8, 11.4 | 255 | 32.1, 32.1, 32.3 |
| `opfs-sahpool` | tuned | wal, 1 | 0 | 0.3 | 0.5 | 8.1 | 2.3 | 32.2 |
| `OPFSCoopSyncVFS` | tuned | delete, 2 | 0 | 3.1 | 5.9 | 15.7 | 6.4 | 32 |
| `opfs-sahpool` | tuned | wal, 1 | 100 | 0.3 | 0.6 | 7.4 | 102 | 32 |
| `OPFSCoopSyncVFS` | tuned | delete, 2 | 100 | 3.2 | 5.3 | 9.7 | 107 | 33.2 |
| `opfs-sahpool` | tuned | wal, 1 | 500 | 0.5 | 4.7 | 6.5 | 502 | 33.8 |
| `OPFSCoopSyncVFS` | tuned | delete, 2 | 500 | 4.5 | 7 | 15.2 | 506 | 32.1 |

**WebKit**, 20 s of typing per run, 3 interleaved rounds

| Layer | Profile | Journal, sync | Batch interval, ms | Batch median per run, ms | Batch p95 per run, ms | Batch max per run, ms | Durable lag p95, ms | CPU calibration, ms |
|---|---|---|---|---|---|---|---|---|
| `opfs-sahpool` | default | delete, 2 | 250 | 7, 7, 6 | 9, 9, 8 | 13, 10, 9 | 258 | 16, 17, 16 |
| `opfs-sahpool` | truncate | truncate, 2 | 250 | 6, 5, 6 | 8, 8, 8 | 11, 8, 9 | 258 | 11, 14, 16 |
| `opfs-sahpool` | wal-limit | wal, 1 | 250 | 1, 0, 1 | 1, 2, 1 | 5, 8, 2 | 251 | 16, 15, 16 |
| `OPFSCoopSyncVFS` | default | delete, 2 | 250 | 5, 5, 5 | 6, 7, 7 | 7, 9, 10 | 257 | 16, 15, 11 |
| `OPFSCoopSyncVFS` | sync-normal | delete, 1 | 250 | 4, 4, 4 | 6, 6, 6 | 8, 10, 7 | 256 | 17, 16, 16 |
| `opfs-sahpool` | tuned | wal, 1 | 0 | 0 | 1 | 9 | 2 | 15 |
| `OPFSCoopSyncVFS` | tuned | delete, 2 | 0 | 4 | 5 | 17 | 6 | 15 |
| `opfs-sahpool` | tuned | wal, 1 | 100 | 0 | 1 | 9 | 102 | 15 |
| `OPFSCoopSyncVFS` | tuned | delete, 2 | 100 | 4 | 24 | 503 | 125 | 14 |
| `opfs-sahpool` | tuned | wal, 1 | 500 | 1 | 2 | 3 | 502 | 15 |
| `OPFSCoopSyncVFS` | tuned | delete, 2 | 500 | 6 | 8 | 12 | 508 | 14 |

## Kill tests

**chromium coi**

| Layer | Setting | Kill | Runs | Corrupt or unreadable | Acknowledged write missing | Typing lost, median / max, ms | Slowest reopen, ms |
|---|---|---|---|---|---|---|---|
| official `opfs` | normal | sigkill-all | 10 | 0 | 0 | 200 / 200 | 274 |
| official `opfs` | normal | sigkill-renderer | 3 | 0 | 0 | 0 / 0 | 282 |
| official `opfs` | normal | page-close | 2 | 0 | 0 | 300 / 300 | 239 |
| official `opfs` | normal | context-close | 1 | 0 | 0 | 300 / 300 | 242 |
| official `opfs` | stress | sigkill-all | 10 | 0 | 0 | 5 / 10 | 280 |
| official `opfs` | stress | sigkill-renderer | 3 | 0 | 0 | 0 / 0 | 280 |
| official `opfs` | stress | page-close | 2 | 0 | 0 | 20 / 20 | 270 |
| official `opfs` | stress | context-close | 1 | 0 | 0 | 20 / 20 | 234 |

**chromium plain**

| Layer | Setting | Kill | Runs | Corrupt or unreadable | Acknowledged write missing | Typing lost, median / max, ms | Slowest reopen, ms |
|---|---|---|---|---|---|---|---|
| `opfs-sahpool` | normal | sigkill-all | 20 | 0 | 0 | 200 / 300 | 617 |
| `opfs-sahpool` | normal | sigkill-renderer | 6 | 0 | 0 | 0 / 0 | 800 |
| `opfs-sahpool` | normal | page-close | 3 | 0 | 0 | 0 / 0 | 424 |
| `opfs-sahpool` | normal | context-close | 3 | 0 | 0 | 200 / 200 | 700 |
| `opfs-sahpool` | stress | sigkill-all | 20 | 0 | 0 | 0 / 0 | 577 |
| `opfs-sahpool` | stress | sigkill-renderer | 6 | 0 | 0 | 0 / 0 | 410 |
| `opfs-sahpool` | stress | page-close | 3 | 0 | 0 | 0 / 0 | 395 |
| `opfs-sahpool` | stress | context-close | 3 | 0 | 0 | 0 / 0 | 377 |
| `OPFSCoopSyncVFS` | normal | sigkill-all | 20 | 0 | 0 | 100 / 300 | 571 |
| `OPFSCoopSyncVFS` | normal | sigkill-renderer | 6 | 0 | 0 | 0 / 0 | 243 |
| `OPFSCoopSyncVFS` | normal | page-close | 3 | 0 | 0 | 100 / 200 | 518 |
| `OPFSCoopSyncVFS` | normal | context-close | 3 | 0 | 0 | 100 / 100 | 426 |
| `OPFSCoopSyncVFS` | stress | sigkill-all | 20 | 0 | 0 | 0 / 0 | 463 |
| `OPFSCoopSyncVFS` | stress | sigkill-renderer | 6 | 0 | 0 | 0 / 0 | 346 |
| `OPFSCoopSyncVFS` | stress | page-close | 3 | 0 | 0 | 0 / 5 | 373 |
| `OPFSCoopSyncVFS` | stress | context-close | 3 | 0 | 0 | 0 / 30 | 394 |

**webkit plain**

| Layer | Setting | Kill | Runs | Corrupt or unreadable | Acknowledged write missing | Typing lost, median / max, ms | Slowest reopen, ms |
|---|---|---|---|---|---|---|---|
| `opfs-sahpool` | normal | sigkill-all | 20 | 0 | 0 | 0 / 200 | 810 |
| `opfs-sahpool` | normal | page-close | 6 | 0 | 0 | 200 / 200 | 747 |
| `opfs-sahpool` | normal | context-close | 6 | 0 | 0 | 200 / 200 | 781 |
| `opfs-sahpool` | stress | sigkill-all | 20 | 0 | 0 | 0 / 150 | 557 |
| `opfs-sahpool` | stress | page-close | 6 | 0 | 0 | 0 / 0 | 500 |
| `opfs-sahpool` | stress | context-close | 6 | 0 | 0 | 0 / 5 | 620 |
| `OPFSCoopSyncVFS` | normal | sigkill-all | 20 | 0 | 0 | 100 / 300 | 583 |
| `OPFSCoopSyncVFS` | normal | page-close | 6 | 0 | 0 | 200 / 300 | 324 |
| `OPFSCoopSyncVFS` | normal | context-close | 6 | 0 | 0 | 200 / 300 | 404 |
| `OPFSCoopSyncVFS` | stress | sigkill-all | 20 | 0 | 0 | 0 / 15 | 454 |
| `OPFSCoopSyncVFS` | stress | page-close | 6 | 0 | 0 | 0 / 25 | 480 |
| `OPFSCoopSyncVFS` | stress | context-close | 6 | 0 | 0 | 0 / 0 | 388 |

## Two tabs

**chromium coi**

| Layer | Second tab, no lock | Both tabs typing (batch ms) | Reads while the other tab writes | Second tab with Web Lock | Takeover after first tab closes |
|---|---|---|---|---|---|
| official `opfs` | opens (251 ms) | tab 1 p95 20.8 max 312; tab 2 p95 20.7 max 26.1; write errors 0+0; verified true/true | 25 reads, median 6.1 max 6313 ms, errors 0 | waits, shows notice | 273 ms, then writes ok |
| official `opfs-wl` | opens (280 ms) | tab 1 p95 18.9 max 21.6; tab 2 p95 24 max 165; write errors 0+0; verified true/true | 126 reads, median 6.7 max 181 ms, errors 0 | waits, shows notice | 209 ms, then writes ok |

**chromium plain**

| Layer | Second tab, no lock | Both tabs typing (batch ms) | Reads while the other tab writes | Second tab with Web Lock | Takeover after first tab closes |
|---|---|---|---|---|---|
| `opfs-sahpool` | fails: Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be created if ther | n/a | n/a | waits, shows notice | 298 ms, then writes ok |
| `OPFSCoopSyncVFS` | opens (303 ms) | tab 1 p95 42.1 max 335; tab 2 p95 43 max 130; write errors 0+0; verified true/true | 148 reads, median 1.9 max 50.2 ms, errors 0 | waits, shows notice | 190 ms, then writes ok |

**webkit plain**

| Layer | Second tab, no lock | Both tabs typing (batch ms) | Reads while the other tab writes | Second tab with Web Lock | Takeover after first tab closes |
|---|---|---|---|---|---|
| `opfs-sahpool` | fails: The object is in an invalid state. | n/a | n/a | waits, shows notice | 108 ms, then writes ok |
| `OPFSCoopSyncVFS` | opens (222 ms) | tab 1 p95 9 max 11; tab 2 p95 8 max 47; write errors 0+0; verified true/true | 153 reads, median 2 max 13 ms, errors 0 | waits, shows notice | 105 ms, then writes ok |

