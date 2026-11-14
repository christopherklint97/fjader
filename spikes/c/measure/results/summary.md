### Worker, as the app runs it (Chromium throttling does not reach workers, so the 4x rows show 1x worker speed)

| Browser | Script | Pages | Full pagination, median (max) ms | First load incl. layout rows ms | Typing at start / middle / end: worker ms median (p95) | Round trip median (p95) | Input to next frame median (p95) | PDF worker ms (3 runs) | PDF size | Browser RSS rise during PDF |
|---|---|---|---|---|---|---|---|---|---|---|
| Chromium 156.0.8078.4, CPU 1x | stress-120 | 120 | 3.8 (8.1) | 23 | 1.5 (2.1) / 2.1 (2.7) / 2.0 (2.3) | 9.7 (17) / 8.1 (17) / 11 (17) | 10 (17) / 8.8 (18) / 12 (18) | 411, 270, 250 | 230 KB | 5 MB |
| Chromium 156.0.8078.4, CPU 1x | stress-500 | 501 | 15 (22) | 103 | 8.0 (12) / 9.6 (11) / 7.4 (8.1) | 11 (18) / 11 (18) / 9.1 (17) | 11 (18) / 12 (19) / 9.3 (18) | 954, 918, 819 | 916 KB | 10 MB |
| Chromium 156.0.8078.4, CPU 4x | stress-120 | 120 | 4.2 (8.4) | 37 | 1.6 (2.3) / 1.7 (2.2) / 1.6 (2.0) | 6.2 (9.1) / 6.8 (11) / 6.7 (11) | 8.7 (12) / 8.4 (13) / 8.5 (13) | 467, 314, 300 | 230 KB | 4 MB |
| Chromium 156.0.8078.4, CPU 4x | stress-500 | 501 | 13 (22) | 111 | 7.8 (12) / 7.2 (7.8) / 7.2 (7.7) | 12 (37) / 13 (18) / 12 (16) | 12 (21) / 14 (20) / 13 (20) | 1179, 1065, 943 | 916 KB | 10 MB |
| WebKit 27.2, CPU 1x | stress-120 | 120 | 8.0 (12) | 83 | 3.0 (6.0) / 2.0 (8.0) / 2.0 (5.0) | 4.0 (6.0) / 3.0 (10) / 4.0 (7.0) | 11 (17) / 9.0 (16) / 10 (16) | 619, 404, 329 | 230 KB | 8 MB |
| WebKit 27.2, CPU 1x | stress-500 | 501 | 24 (33) | 200 | 12 (22) / 13 (28) / 12 (27) | 14 (22) / 15 (30) / 13 (27) | 10 (18) / 10 (20) / 8.0 (18) | 1559, 1319, 1118 | 916 KB | 10 MB |

### Same code on the main thread (where Chromium 4x throttling applies)

| Browser | Script | Pages | Full pagination median (max) ms, 7 runs | Incremental edit start / middle / end, median (p95) ms, 33 edits each | PDF write ms (2 runs) |
|---|---|---|---|---|---|
| Chromium 156.0.8078.4, CPU 1x | stress-120 | 120 | 5.4 (52) | 1.9 (4.2) / 1.3 (2.3) / 1.2 (2.2) | 309, 271 |
| Chromium 156.0.8078.4, CPU 1x | stress-500 | 501 | 13 (38) | 7.5 (12) / 7.0 (45) / 7.1 (24) | 775, 763 |
| Chromium 156.0.8078.4, CPU 4x | stress-120 | 120 | 14 (56) | 5.9 (13) / 5.8 (9.5) / 5.3 (8.7) | 1145, 1027 |
| Chromium 156.0.8078.4, CPU 4x | stress-500 | 501 | 43 (78) | 32 (41) / 30 (169) / 30 (168) | 3198, 3135 |
| WebKit 27.2, CPU 1x | stress-120 | 120 | 12 (48) | 3.0 (5.0) / 2.0 (3.0) / 2.0 (2.0) | 487, 327 |
| WebKit 27.2, CPU 1x | stress-500 | 501 | 14 (24) | 10 (17) / 10 (14) / 10 (21) | 1122, 1083 |
