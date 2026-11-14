# Spike C results: screenplay pagination

Status: automated part done. **The manual phone checklist has not been run** (it needs a real iPhone and a real Android phone), and **the owner's Final Draft check has not been run**; it is prepared (section 9). An automated comparison against Final Draft output was possible anyway, because fountain.io publishes Final Draft PDFs of its sample scripts (section 3), but those come from Final Draft 8 (2012), not today's version.

Code: `spikes/c/` (the spec says `spikes/C/`; lower case is used instead, as for spike A). Phone demo: the build is copied to a static demo host (`https://<host>/c/`; checked in Chromium and WebKit through its local URL).

## 1. Answer

Yes, with one open number. One pure TypeScript paginator, ported from afterwriting's liner and extended, reproduces afterwriting's page breaks exactly, reproduces Final Draft 8's page breaks on three public scripts once Final Draft's rules are added, runs in a Worker fast enough to repaginate a 120-page script on every keystroke, and drives a PDFKit writer whose pages match the screen row for row. The open number is the character pitch modern Final Draft uses (section 3, item 1); it decides whether breaks match Final Draft line for line, not whether page counts match.

| Threshold | Result | Verdict |
|---|---|---|
| afterwriting reference: identical page count and identical breaks on at least 95% of pages, every difference explained | 8 of 9 scripts: same count, every page identical. stress-500: 485 pages against afterwriting's 491; 481 of 485 pages identical; the 6 extra pages and 4 differing pages are an afterwriting PDF bug, explained in section 2. Overall 798 of 802 pages (99.5%). | **Pass** |
| Final Draft: page count within one page per 100 pages, where measured | Measured automatically against Final Draft 8 PDFs (fountain.io): 4/4, 20/20, 120/120 pages; pages identical 4/4, 20/20, 115/120. Not measured against current Final Draft (owner's step, prepared). | **Pass against Final Draft 8; current Final Draft unknown** |
| Editor and PDF: identical page breaks on every page | Text of every PDF page extracted and compared row by row (text, row, indent) with the paginator's pages: 120/120, 501/501, 124/124, 121/121 (PDFKit under Bun) and 120/120 for the PDFs the browser build wrote in Chromium and in WebKit. | **Pass** |
| Page count updated within 100 ms of an edit, 120 pages, off the main thread, keystrokes unaffected (phones) | Desktop browsers on the build host: worker time per edit 1.5-3 ms median, round trip to the page 3-11 ms median, input to next frame p95 ≤ 18 ms. Same code on the main thread at 4x CPU: 5-6 ms per edit. Phones not measured. | **Pass on the desktop signal; phones not measured** |
| Full pagination of 120 pages within 300 ms (phones) | 4-8 ms median in the worker; 14 ms median on the main thread at 4x. Phones not measured. | **Pass on the desktop signal** |
| PDF of 120 pages in a Worker within 3 s with Courier Prime embedded, page not killed (phones) | 0.25-0.62 s in the worker (Chromium, WebKit); 1.0-1.1 s on the main thread at 4x; Courier Prime embedded and subset; browser memory rise at most 10 MB. 500 pages: 0.8-1.6 s in the worker, 3.2 s at 4x. Phones not measured. | **Pass on the desktop signal** |

## 2. Accuracy against afterwriting

### Provenance of ported code

| Our file | Ported from | Upstream commit / version | Licence |
|---|---|---|---|
| `src/paginator/wrap.ts` | afterwriting-labs `js/utils/liner.js` (`split_text`) | git `f1912c08d0905bac42e1805830a1e72f98b88c2f` (2024-09-24); the file itself last changed in `9a256d1d` | MIT, Copyright (c) 2015-2020 Piotr Jamróz |
| `src/paginator/paginate.ts`, rule set `afterwriting` | same file: `default_breaker`, `break_lines`, `fold_dual_dialogue`, `line` | same | same |
| `src/paginator/profiles.ts`, `afterwritingUsLetter` | afterwriting-labs `js/utils/print-profiles.js` | same | same |
| `src/paginator/layout.ts` (dual-dialogue x positions) | afterwriting-labs `js/utils/pdfmaker.js` | same | same |
| `src/load/fountain.ts` | npm `aw-parser@0.1.1` `parser.js` (the parser afterwriting 1.17.3 uses) | npm tarball 0.1.1 | MIT, Copyright (c) 2017 aw-parser |

The MIT notice is reproduced at the top of each ported file. betterfountain (`src/pdf/liner.ts`, MIT, commit `4f109ec1`) was read and diffed against afterwriting's liner: same algorithm, a renamed `(MORE)` line type and some null checks, so nothing was taken from it. Upstream repositories were cloned outside this repository and only read.

The port keeps afterwriting's rules and quirks on purpose (so the comparison tests the port, not a rewrite) but changes the structure: a page is cut from a window over a flat line stream starting at a recorded position, with no array splicing or mutation of shared lines. That makes a page depend only on where it starts, which is what the incremental mode needs.

### Method

afterwriting's CLI (npm `afterwriting@1.17.3`) produced reference PDFs for every Fountain script, US letter, no title page, defaults otherwise (`tools/afterwriting-ref.sh`). The CLI ran only inside a capped container (`--network none`, only the input folder read-only and the output folder mounted, dependencies installed with `npm install --ignore-scripts`). Nothing from afterwriting ran on the host.

Pages are compared on text extracted with poppler's `pdftotext -bbox-layout` (`tools/compare.ts`). A page counts as identical when its first and last content rows match (rows that are only `(MORE)` or a `(CONT'D)` name are skipped on both sides). A second measure cuts each page independently, starting where the reference page starts, so one early difference does not count against every later page.

### Results (rule set `afterwriting`, profile `afterwriting-usletter`)

| Script | Source | Our pages | afterwriting pages | Pages identical | All rows identical |
|---|---|---|---|---|---|
| Brick & Steel | fountain.io sample | 3 | 3 | 3/3 | 3 |
| The Last Birthday Card | fountain.io sample | 19 | 19 | 19/19 | 19 |
| Big Fish | fountain.io sample | 121 | 121 | 121/121 | 121 |
| test.fountain | afterwriting test fixture | 4 | 4 | 4/4 | 4 |
| printing_trouble | afterwriting sample | 11 | 11 | 11/11 | 11 |
| my_living_memory | afterwriting sample | 15 | 15 | 15/15 | 15 |
| stress-30 | ours (generated, seed 7) | 30 | 30 | 30/30 | 24 |
| stress-120 | ours | 115 | 115 | 115/115 | 102 |
| stress-500 | ours | 485 | 491 | 481 of 485 | 445 |

"All rows identical" below 100% on the generated scripts is the text extractor, not the paginator: dual-dialogue rows (two columns on one row) and lines of 90 characters without spaces come out of `pdftotext` grouped differently. The first and last rows of every page match.

**The one real difference is an afterwriting bug, not a port error.** afterwriting moves the right column of dual dialogue onto the left character line and never counts its height. Twice in stress-500 a long right column near the bottom of a page runs past the bottom edge of the paper; PDFKit then starts a new page on its own, and the rest of that page's drawing lands on extra pages: 3 extra pages per event (reference pages 231-233 and 403-405). After skipping them, the reference lines up again page for page. The port reproduces afterwriting's liner, so it has the same two overfull pages (230 and 399, 62 rows on a 55-row page). The `fd` rule set (below) treats dual dialogue as one block as tall as its taller column and does not have this bug.

Other afterwriting quirks kept in the `afterwriting` rule set, and fixed or replaced in `fd`: dual dialogue can be split across pages (a property test that is always undefined); a page may keep a single line of dialogue above `(MORE)`; when no break is allowed the page gets 55 + 1 lines; with several forced page breaks inside one page it honours the last one; action paragraphs of 1-3 lines never split; no sentence awareness.

## 3. Accuracy against Final Draft

fountain.io publishes each sample script as Fountain, FDX and PDF. The three PDFs say `Creator: Final Draft` and were made in 2012 on Mac OS X, so Final Draft 8. These are real Final Draft page breaks for public scripts. The FDX is the input (it is what Final Draft paginated), with the layout read from its own `PageLayout` and `ElementSettings` (each of the three uses different, non-default margins). Big Fish's PDF has a title page and an epigraph page that are not in the FDX; the comparison skips them by aligning on the first script line.

| Script | Our pages | Final Draft 8 pages | Pages identical | Breaks agreeing when each page starts where Final Draft's starts |
|---|---|---|---|---|
| Brick & Steel | 4 | 4 | 4/4 | 3/3 |
| The Last Birthday Card | 20 | 20 | 20/20 | 19/19 |
| Big Fish | 120 | 120 | 115/120 (95.8%) | 112/112 that the tool can place (7 pages start mid-paragraph and are not located) |

What it took, all found by reading Final Draft's PDFs; each is a profile setting of the new `fd` rule set:

1. **Character pitch.** In all three PDFs Final Draft places characters 6.995 pt apart, not the 7.2 pt of true 10-pitch Courier (median over 20,000 word gaps in Big Fish; same in the other two). A 6.0-inch action line therefore holds 61 characters, not 60, and a 3.5-inch dialogue column 36, not 35. Those are afterwriting's widths (61 and 36), which suggests afterwriting was tuned against Final Draft output. With true 10-pitch widths the page counts still match within one page (4, 20, 121 against 4, 20, 120), but only 11 of Big Fish's 120 pages are identical. **This is the main open question for the owner's check: does today's Final Draft still set its Courier at 6.995 pt?** `tools/check-fd.ts` measures it from any Final Draft PDF.
2. **Hyphens.** Final Draft breaks a line after a hyphen inside a word ("hundred-/dollar"), and lets a hyphen or a `--` hang one column into the right margin. Without this, Big Fish drops to 19 identical pages.
3. **Sentence breaks.** With "break dialogue and action at sentences" on (Big Fish, Brick & Steel), a paragraph is split after the last sentence that fits, even mid-line, and the rest is re-wrapped at the top of the next page. With it off (Last Birthday Card) it splits at line ends. Off for Big Fish: 83 identical pages instead of 115.
4. **`(MORE)` and `NAME (CONT'D)` take no body line.** The carried name is printed one row above the first body row, and `(MORE)` may sit one row below the last (Big Fish pages 25 and 97). Without the top rule: 24 identical pages.
5. **Minimums.** At least 2 lines of an action paragraph and 2 dialogue lines on each side of a split. Sweeps: action minimum 1 or 3 drops Big Fish to 103 or 21 identical pages; dialogue minimum after the break 1 or 3 gives 110 or 112; dialogue minimum before the break 1 makes no difference, 3 gives 97.
6. **Parenthetical before `(MORE)`.** Final Draft 8 leaves a parenthetical as the last line above `(MORE)` (Big Fish page 30). The spec's rule says it must not. With the spec's rule, Big Fish has 113 identical pages instead of 115. The app profile keeps the spec's rule; the Final Draft comparison uses Final Draft's behaviour.
7. Trailing spaces never make a line of their own, and a wrapped line never starts with a space.

Lines per page: 54 (9 inches at 6 lines per inch) is right. 53 or 55 changes the page count of Big Fish by 2 and leaves under 3% of pages identical.

Character indent: it never changes a break unless a name is wider than its column, so the Final Draft comparison is indifferent to it. The app profile uses 3.7 inches as `docs/PLAN.md` says; note that Final Draft 8's default template (Brick & Steel's FDX) has 3.5 inches.

Remaining Big Fish differences (pages 72-76): song lyrics set in Final Draft's italic, which in that PDF is narrower (about 45 characters fit a 39-character column). A fixed-pitch model cannot follow per-style font metrics. The pages re-align at 77.

**Overfitting.** The rules were found on these three scripts and are measured on the same three scripts. There was no held-out Final Draft script. Brick & Steel and Last Birthday Card matched fully once pitch and dual-dialogue parsing were right; rules 3-7 came from Big Fish.

## 4. Editor against PDF

The viewer and the PDF writer both draw from `layout.ts`, which turns the paginator's page lines into rows and x positions; the PDF writer calls PDFKit with `lineBreak: false` for every row, so nothing re-flows. `tools/pdf-check.ts` writes the PDF, extracts it with poppler, and checks every page row by row (text, row number, indent within 0.02 inch):

| Script | Profile | Pages | PDF pages | Pages identical | PDF time (Bun, this host) | Size | Font |
|---|---|---|---|---|---|---|---|
| stress-120 | us-feature | 120 | 120 | 120 | 0.32 s | 221 KB | Courier Prime, embedded, subset |
| stress-500 | us-feature | 501 | 501 | 501 | 0.98 s | 878 KB | same |
| Big Fish (Fountain) | us-feature | 124 | 124 | 124 | 0.31 s | 218 KB | same |
| Big Fish (Fountain) | afterwriting | 121 | 121 | 121 | 0.29 s | 228 KB | same |

The PDFs the browser build wrote (stress-120, downloaded from the demo in Chromium and in WebKit) pass the same check: 120/120 pages each (`tools/verify-browser-pdf.ts`).

## 5. Timings

Host: Raspberry Pi 5 (4 cores, 8 GB), arm64, hard CPU caps shared with other workloads. Playwright 1.64.1: Chromium 156 headless shell and WebKit 27.2 (WPE), production build served from 127.0.0.1, phone viewport 390 x 844. Scripts: our generated stress scripts, 120 and 501 pages in the `us-feature` profile (1,902 and 7,944 elements). Big Fish is not bundled into the demo (third-party text).

How to read these:
- **Chromium's CPU throttling does not reach Web Workers.** The 4x rows of the first table therefore show 1x worker speed (the worker numbers barely change). The second table runs the same paginator and PDF code on the main thread, where the 4x throttle applies; that is the 4x figure.
- WebKit automation has no CPU throttle; WebKit rounds timers to whole milliseconds.
- As spike A noted, one Pi 5 core is roughly a 2022 mid-range Android phone and slower than an iPhone 12 (recollection, not measured), so 1x here is near the budget's phone class and 4x is a pessimistic bound.
- "Input to next frame" is from the key event to the first frame after the input handler (`requestAnimationFrame` then a task), as in spike A. Typing is 33 characters at 80 ms intervals, into an element near the start, middle and end of the script.

#### Worker, as the app runs it (Chromium throttling does not reach workers, so the 4x rows show 1x worker speed)

| Browser | Script | Pages | Full pagination, median (max) ms | First load incl. layout rows ms | Typing at start / middle / end: worker ms median (p95) | Round trip median (p95) | Input to next frame median (p95) | PDF worker ms (3 runs) | PDF size | Browser RSS rise during PDF |
|---|---|---|---|---|---|---|---|---|---|---|
| Chromium 156.0.8078.4, CPU 1x | stress-120 | 120 | 3.8 (8.1) | 23 | 1.5 (2.1) / 2.1 (2.7) / 2.0 (2.3) | 9.7 (17) / 8.1 (17) / 11 (17) | 10 (17) / 8.8 (18) / 12 (18) | 411, 270, 250 | 230 KB | 5 MB |
| Chromium 156.0.8078.4, CPU 1x | stress-500 | 501 | 15 (22) | 103 | 8.0 (12) / 9.6 (11) / 7.4 (8.1) | 11 (18) / 11 (18) / 9.1 (17) | 11 (18) / 12 (19) / 9.3 (18) | 954, 918, 819 | 916 KB | 10 MB |
| Chromium 156.0.8078.4, CPU 4x | stress-120 | 120 | 4.2 (8.4) | 37 | 1.6 (2.3) / 1.7 (2.2) / 1.6 (2.0) | 6.2 (9.1) / 6.8 (11) / 6.7 (11) | 8.7 (12) / 8.4 (13) / 8.5 (13) | 467, 314, 300 | 230 KB | 4 MB |
| Chromium 156.0.8078.4, CPU 4x | stress-500 | 501 | 13 (22) | 111 | 7.8 (12) / 7.2 (7.8) / 7.2 (7.7) | 12 (37) / 13 (18) / 12 (16) | 12 (21) / 14 (20) / 13 (20) | 1179, 1065, 943 | 916 KB | 10 MB |
| WebKit 27.2, CPU 1x | stress-120 | 120 | 8.0 (12) | 83 | 3.0 (6.0) / 2.0 (8.0) / 2.0 (5.0) | 4.0 (6.0) / 3.0 (10) / 4.0 (7.0) | 11 (17) / 9.0 (16) / 10 (16) | 619, 404, 329 | 230 KB | 8 MB |
| WebKit 27.2, CPU 1x | stress-500 | 501 | 24 (33) | 200 | 12 (22) / 13 (28) / 12 (27) | 14 (22) / 15 (30) / 13 (27) | 10 (18) / 10 (20) / 8.0 (18) | 1559, 1319, 1118 | 916 KB | 10 MB |

#### Same code on the main thread (where Chromium 4x throttling applies)

| Browser | Script | Pages | Full pagination median (max) ms, 7 runs | Incremental edit start / middle / end, median (p95) ms, 33 edits each | PDF write ms (2 runs) |
|---|---|---|---|---|---|
| Chromium 156.0.8078.4, CPU 1x | stress-120 | 120 | 5.4 (52) | 1.9 (4.2) / 1.3 (2.3) / 1.2 (2.2) | 309, 271 |
| Chromium 156.0.8078.4, CPU 1x | stress-500 | 501 | 13 (38) | 7.5 (12) / 7.0 (45) / 7.1 (24) | 775, 763 |
| Chromium 156.0.8078.4, CPU 4x | stress-120 | 120 | 14 (56) | 5.9 (13) / 5.8 (9.5) / 5.3 (8.7) | 1145, 1027 |
| Chromium 156.0.8078.4, CPU 4x | stress-500 | 501 | 43 (78) | 32 (41) / 30 (169) / 30 (168) | 3198, 3135 |
| WebKit 27.2, CPU 1x | stress-120 | 120 | 12 (48) | 3.0 (5.0) / 2.0 (3.0) / 2.0 (2.0) | 487, 327 |
| WebKit 27.2, CPU 1x | stress-500 | 501 | 14 (24) | 10 (17) / 10 (14) / 10 (21) | 1122, 1083 |

Notes:
- Full pagination is cheap (5-30 ms for 120-500 pages), so the incremental mode saves less than expected: an edit at 120 pages costs 1.5-3 ms against 4-8 ms for a full run (at 4x on the main thread: 5-6 ms against 14 ms). At 500 pages, rebuilding the line stream (every element's lines, from a per-element wrap cache) dominates at 7-12 ms; the page cutting itself stops after 2-4 pages. If phones need it, the stream can be patched instead of rebuilt.
- The first load includes building the render rows for every page and posting them to the page.
- Memory: the browser's total resident memory rose by at most 10 MB during a PDF export (sampled every 25 ms from `/proc`; a proxy, since automation cannot read a worker's heap). Under Bun, writing the 500-page PDF raised resident memory by 20-28 MB.

### A WebKit failure found and fixed

The first demo build typed at 600-800 ms per key in WebKit (input to next frame), against 10-20 ms in Chromium. Probing showed WebKit producing a frame only every 0.5-1.2 s. The cause was a CSS `box-shadow` on the 120 page boxes: with WPE's software rendering on this host every frame repainted them. Replacing it with an outline brought WebKit to 27 ms median. A second fix, sending only pages whose rows actually changed (an edit recomputes 2-4 pages, of which usually 1 differs), brought it to 12 ms median, 19 ms p95. Whether iOS Safari, which composites on the GPU, would have suffered the same is not known; the lesson for the real editor is to keep page chrome cheap and to update only changed pages.

## 6. Break rules and tests

| Rule | `afterwriting` rules | `fd` rules (app profile `us-feature`) | Covered by |
|---|---|---|---|
| Fixed-pitch wrapping per element width | yes | yes, plus hyphen breaks and hanging dash | `test/paginator.test.ts` "wrap"; all comparisons |
| Scene heading stays with what follows | yes | yes (also shot, character, `CONT'D`) | test "a scene heading is never the last line"; invariant check on stress-120/500 |
| Lone line of dialogue moves to the next page | no (keeps one line above `(MORE)`) | yes, at least 2 dialogue lines each side | test "a lone line of dialogue moves"; invariant check |
| Split speech gets `(MORE)` and `NAME (CONT'D)` | yes | yes | test "split speech gets (MORE)..."; invariant check; Big Fish against Final Draft |
| Parenthetical not last before a break | yes | yes in `us-feature`; Final Draft 8 does not follow it (setting) | test "a parenthetical is not left..."; invariant check |
| Breaks at sentence ends where possible | no | yes, mid-line with re-wrap, as Final Draft | test "action splits only at a sentence end"; Big Fish and Brick & Steel against Final Draft |
| Dual dialogue side by side | yes, but split across pages and not counted (bug) | yes, one block as tall as the taller column | test "dual dialogue stays side by side"; invariant check |
| Transition stays with what it follows | yes | yes | comparisons only |
| Forced page break | yes (last one in a page wins) | yes (first wins) | comparisons (stress scripts contain them) |
| Incremental result equals full pagination | | | test "incremental equals full pagination": 150 random edits per profile on a 120-page script, page-by-page equality after every edit |
| No text lost or duplicated | | | invariant check (every element's characters appear exactly once, in order) |

## 7. Incremental mode

`src/paginator/incremental.ts`. After a text edit: re-wrap only the edited element (cached per element), rebuild the line stream, restart from the page before the one holding the last line before the edited block (a block is a whole speech or dual-dialogue block, because the rules look across it), and stop as soon as a page starts where an old page started, shifted by the change in line count, with the same carried lines. The old pages from there on are reused. In the measurements every update resynchronised (33 of 33 per position) after recomputing 2-4 pages. Structural edits (insert or delete an element) fall back to full pagination; the demo only edits text.

## 8. Dependencies and licences

Shipped in the demo:

| Package | Version | Licence |
|---|---|---|
| pdfkit | 0.20.2 | MIT |
| its dependencies: fontkit 2.0.4, restructure 3.0.2, unicode-properties 1.4.1, unicode-trie 2.0.0, linebreak 1.1.0, png-js 2.0.0 (MIT in its LICENSE file; none in package.json), fflate 0.8.3, @noble/hashes 1.8.0, @noble/ciphers 1.3.0, brotli 1.3.3, pako 0.2.9, dfa 1.2.0, clone 2.1.2, fast-deep-equal 3.1.3, tiny-inflate 1.0.3, base64-js 0.0.8 | | MIT |
| @swc/helpers (via fontkit) | 0.5.24 | Apache-2.0 |
| Courier Prime Regular (from google/fonts `ofl/courierprime`) | 2015 release | SIL Open Font License 1.1 (`public/fonts/OFL.txt`) |
| Ported code: afterwriting liner, print profile, pdfmaker positions; aw-parser | see section 2 | MIT |

Build and test only: vite 8.3.8 (MIT; pulls lightningcss, MPL-2.0), typescript 7.0.2 (Apache-2.0), playwright 1.64.1 (Apache-2.0), @types/pdfkit, @types/bun (MIT), Bun 1.4 as the test runner (MIT). poppler's `pdftotext` (GPL) is used as an external command to read PDFs in the comparison tools; it is not linked or shipped. All compatible with AGPL-3.0.

## 9. Manual steps for the owner

### Final Draft (not done; prepared)

Files: run `spikes/c/tools/fetch-refs.sh` (downloads fountain.io's Fountain, FDX and Final Draft 8 PDFs, afterwriting's samples, and generates the stress scripts into `spikes/c/reference/in/`).

1. Open `brick-and-steel.fdx`, `the-last-birthday-card.fdx` and `big-fish.fdx` in Final Draft. Note the page counts (Final Draft 8 gave 4, 20 and 120 script pages; Big Fish's PDF adds a title page and an epigraph page). Export each as PDF.
2. For each exported PDF run `cd spikes/c && bun run tools/check-fd.ts reference/in/<name>.fdx <exported.pdf>`. It prints the character pitch Final Draft used and the comparison at true 10 pitch and at the measured pitch. **The pitch is the number that matters most.**
3. Open `brick-and-steel.fountain`, `the-last-birthday-card.fountain`, `big-fish.fountain` and `stress-120.fountain` in Final Draft (File > Open, Fountain; default template). Our predictions with the `us-feature` profile: 4, 20, 124 (including the epigraph page, which the Fountain forces onto its own page) and 120 pages. `bun run tools/predict.ts > reference/results/predicted-for-final-draft.txt` (after `fetch-refs.sh`) writes the first line of every page for Brick & Steel and The Last Birthday Card; that file is not committed because it quotes the scripts. Note Final Draft's count and the first line of each page for one script, and run `check-fd.ts` on its PDF export as in step 2.

Threshold: within one page per 100 pages.

### Phones (not done)

Open the demo on the phone over the tailnet, install it to the Home Screen (iPhone), then:

- [ ] Load "Stress script, ~120 pages", tap a line in the middle, type. Does the page count update without the typing stalling? Note "update" and "input→frame" in the status line.
- [ ] Press PDF. Does it finish, does the app survive? Note the PDF time in the status line. Download it.
- [ ] Open the PDF. Compare three pages chosen at random against the screen: same first and last line?
- [ ] Repeat the export with "Stress script, ~500 pages".

The page view on screen is drawn from the same rows as the PDF, at 85 characters across the screen width, so text is small on a phone; pinch to zoom.

## 10. What could not be verified

- Current Final Draft: no copy here. Final Draft 8's behaviour is measured; whether later versions changed pitch, `(MORE)`/`(CONT'D)` placement or the parenthetical rule is unknown.
- The Nicholl formatting sample was not used. oscars.org blocks scripted downloads (HTTP 403); a Wayback copy was downloaded (`reference/in/nicholl.pdf`), but it is a Word document laid out by hand, there is no source text to paginate, and transcribing it was not worth it next to three real Final Draft PDFs.
- Phones: no timing, memory or crash behaviour on iOS or Android was measured. WebKit here is the Linux WPE port, not iOS Safari.
- Worker memory directly: automation cannot read a worker's heap; browser process memory was sampled instead.
- Final Draft's behaviour beyond what three scripts exercise: dual dialogue near a page break, very long parentheticals, scene numbers and `CONTINUED` (out of scope), A4.
- Italic and bold text: the model is fixed pitch for all styles; Final Draft 8's italic was narrower.

## 11. Recommendation

Adopt the approach: one TypeScript line-counting paginator, in a Worker, feeding the same page layout to the editor and to a PDFKit writer with Courier Prime. Start the real engine from this spike's `fd` rule set (not afterwriting's rules, whose dual-dialogue bug and missing sentence breaks show up in real scripts), keep the afterwriting rule set and the comparison tools as regression tests, and keep the rules as profile settings. Before phase 2 builds on it, close two items: the owner's Final Draft check (above all the character pitch, which decides whether lines are 60 or 61 characters wide) and the phone checklist. The incremental mode is correct but not needed at 120 pages; keep it for 500-page scripts and slow phones.

## 12. Commands

From `spikes/c/`:

- Install: `bun install --ignore-scripts` (Playwright uses the browsers already in the cache; nothing is downloaded).
- Build: `bun run build`. Serve: `bun run serve` (127.0.0.1:4319).
- Reference files: `./tools/fetch-refs.sh`; afterwriting PDFs: `AW=<unpacked afterwriting@1.17.3> ./tools/afterwriting-ref.sh` (container, no network).
- Comparison: `bun run compare` (`--verbose` lists each differing break). Editor against PDF: `bun run tools/pdf-check.ts`. Final Draft check: `bun run tools/check-fd.ts <script> <pdf>`.
- Tests: `bun run test`. Typecheck: `bun run typecheck`.
- Measurements: `node measure/run.mjs <chromium|webkit> <throttle>`, `node measure/bench.mjs <chromium|webkit> <throttle>`, then `node measure/report.mjs`. Raw results: `spikes/c/measure/results/`.
