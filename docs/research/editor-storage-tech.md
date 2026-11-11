# Research report: editor, storage, and export stack for a long-form writing PWA

Versions, licences and release counts come from registry.npmjs.org and api.github.com, queried 2026-11-10 ("12mo" = releases in the last 12 months). No file paths apply; nothing was written locally.

## Recommended stack

- **Editor: ProseMirror (raw, or Tiptap 3's MIT core), one instance per scene, mounted near the viewport.** It has strict schemas and bindings for all three CRDTs, and a Lexical issue cites it handling 1.1M characters smoothly ([src](https://github.com/facebook/lexical/issues/7422)). Risk: no production virtualisation exists for it, so cross-scene selection, find and scroll anchoring are yours to build.
- **Storage: SQLite WASM on OPFS, with one CRDT doc per scene.** Use Yjs 13 for maturity, or Loro if version history is central. Risk: Yjs 14 and its ProseMirror binding are still pre-release.
- **Search: FTS5 in the same database, plus a linear scan for regex.**
- **Pagination and export: one pure-TypeScript line-counting paginator feeding both the editor and a Worker PDF writer (PDFKit or the `@cantoo/pdf-lib` fork).** Lazy-load typst.ts for novels. Risk: iOS memory kills, and typst.ts is a slow-moving community project.
- **Framework: React 19 by default.** With raw ProseMirror and Yjs the choice is nearly free.

## 1. Editor engines

| Engine | Licence | Latest | 12mo |
|---|---|---|---|
| prosemirror-view | MIT | 1.42.9 | 16 |
| @tiptap/core | MIT | 3.33.1 | 71 |
| lexical | MIT | 0.53.0 | 15 |
| @codemirror/view | MIT | 6.43.15 | 41 |
| slate | MIT | 0.147.4 | 33 |
| platejs | MIT | 53.5.2 | 36 |
| @blocknote/core | MPL-2.0 | 0.57.0 | 34 |
| wordgard | MIT | 0.6.2 | new |

- **ProseMirror:** repos moved to code.haverbeke.berlin and the GitHub ones were archived in April 2026 ([src](https://discuss.prosemirror.net/t/prosemirrors-migration-to-forgejo/8974)). Android fixes continue, e.g. 1.41.8 for virtual-keyboard paste ([changelog](https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md)).
- **ProseMirror large documents:**
  - Users report Chrome lag at about 3,000 words, attributed to DOM node count and spellcheck ([src](https://discuss.prosemirror.net/t/performance-issues-with-prosemirror-and-chrome/2498)).
  - Whole novels were responsive in react-prosemirror production builds on phones, but slow in Firefox on macOS ([src](https://discuss.prosemirror.net/t/making-react-prosemirror-really-really-fast/8980)).
  - Viewport rendering is out of scope for the maintainer ([src](https://discuss.prosemirror.net/t/efficient-viewport-rendering-like-codemirror/577)).
- **Tiptap:** 3.0 went stable 2025-07-12 ([src](https://tiptap.dev/blog/release-notes/tiptap-3-0-is-stable)). The editor is MIT. Collaboration, comments, history, AI and conversion are paid from $49/month, and Pages from $149/month, with no free hosted tier ([src](https://tiptap.dev/pricing)).
- **Lexical:** 500 kB of text gave about 1 s per keystroke in v0.29. The maintainer says it works until "hundreds of thousands of nodes" and has no virtualisation; the issue closed in May 2026 after improvements ([src](https://github.com/facebook/lexical/issues/7422)).
- **Slate/Plate:** under about 1,000 blocks needs nothing special; chunking for 10k+ blocks is experimental ([src](https://docs.slatejs.org/walkthroughs/09-performance)). Plate's virtualised mode is "experimental and not production-ready" ([src](https://next.platejs.org/docs/slate/libraries/slate-react/experimental-virtualized-rendering)).
- **CodeMirror 6:** the only engine with built-in viewport rendering ([src](https://codemirror.net/docs/guide/)), but it is not a schema-based rich-text editor.
- **BlockNote:** PDF/DOCX exporters and multi-column are GPL-3.0 or commercial ([src](https://www.blocknotejs.org/legal/blocknote-xl-commercial-license)).
- **Wordgard:** Marijn Haverbeke's new editor, released 2026-07-02. It stays 0.x for at least a year and takes no pull requests, so it is too early ([src](https://marijnhaverbeke.nl/blog/wordgard-0.1.html)).
- **Collaboration:** y-prosemirror 1.3.7 dates from July 2025, and its rewrite `@y/prosemirror` is in beta. Alternatives are loro-prosemirror 0.4.4 and `@automerge/prosemirror` 0.2.0.

## 2. How products handle large documents

- **Virtualisation pitfalls,** as listed in Plate's docs: browser find sees only mounted blocks, large selections and copy must go through the model, screen readers traverse only mounted blocks, and mobile/IME is unproven ([src](https://next.platejs.org/docs/slate/libraries/slate-react/experimental-virtualized-rendering)).
- **CodeMirror/Obsidian:** the viewport is fixed and not configurable, and fast scrolling can show blank frames ([src](https://discuss.codemirror.net/t/improve-scroll-performance-tradeoff/8825)). Obsidian users report viewport-stabilisation loops with variable-height embeds ([src](https://forum.obsidian.md/t/scrolling-unusable-when-document-has-transclusions-large-jumps-up-down-and-infinite-jump-loops-with-viewport-failed-to-stabilize-measure-loop-restarted-more-than-5-times/112103)).
- **Google Docs:** moved to canvas in 2021 for performance and consistency ([src](https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html)). A canvas renderer on ProseMirror state exists but is experimental, and Marijn flags IME and screen-reader support as very hard ([src](https://discuss.prosemirror.net/t/building-a-canvas-based-editor-on-top-of-prosemirror-s-state-and-plugin-system/8982)).
- **`content-visibility: auto`:** supported since Safari 18. Find-in-page for skipped content was fixed in Safari 26.0 ([src](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes)). Apply it per chunk, because per-element use can be slower in Safari, and off-screen content stays in the accessibility tree ([src](https://docs.slatejs.org/walkthroughs/09-performance)).
- **Zed:** uses a rope on a SumTree ([src](https://zed.dev/blog/zed-decoded-rope-sumtree)).

## 3. Live pagination

- **Line counting is the usual open-source approach.** Emacs Fountain Mode paginates by a max-lines-per-page setting (search snippet only; the page did not load).
- **Scrite:** calls its editor pagination approximate; it runs off the UI thread and is off by default ([src](https://www.scrite.io/docs/userguide/screenplay/)).
- **Beat:** GPL-3, with pagination as a separate module that reports page length in eighths ([src](https://github.com/lmparppei/Beat)).
- **Arc Studio:** breaks at sentence ends by default ([src](https://help.arcstudiopro.com/all-how-tos/how-do-i-enable-page-breaks-in-the-middle-of-a-dialogue-or-action-sentence)).
- **Tiptap Pages:** paid and in beta, and an unsplittable block taller than a page causes an infinite layout loop ([src](https://tiptap.dev/docs/pages/getting-started/overview)).
- **Community extensions:** tiptap-pagination-plus (MIT, 3.1.0, April 2026), tiptap-community-pages (MIT, 0.1.2), and tiptap-extension-pagination (stale since March 2025). None is mature.

## 4. Storage and sync

| Project | Licence | Latest | Note |
|---|---|---|---|
| Yjs | MIT | 13.6.33 | v14 (`@y/y` rc.29) adds attributions and versioning ([src](https://fosdem.org/schedule/event/8VKQXR-blocknote-yjs-prosemirror)) |
| Automerge | MIT | 3.5.0 | v3 cut memory by over 10x ([src](https://automerge.org/blog/automerge-3/)) |
| Loro | MIT | 1.17.1 | time travel and shallow snapshots built in ([src](https://loro.dev/blog/v1.0)) |
| Zero | Apache-2.0 | 1.11.5 | self-host needs zero-cache and Postgres ([src](https://zero.rocicorp.dev/docs/self-host)) |
| ElectricSQL | Apache-2.0 | 1.5.28 | |
| InstantDB | Apache-2.0 | 1.0.67 | |
| LiveStore | Apache-2.0 | 0.5.0 | pre-1.0 |
| Jazz | MIT | 2.0 alpha | conflicts resolve last-write-wins ([src](https://jazz.tools/docs/concepts/how-sync-works)) |
| Triplit | AGPL-3.0 | 1.0.50 | no npm release since July 2025; founder joined Supabase ([src](https://supabase.com/blog/triplit-joins-supabase)) |
| PowerSync | SDKs Apache-2.0 | 1.39.2 | service licence disputed, see below |

- **PowerSync sources disagree:** the docs call the service source-available under FSL ([src](https://docs.powersync.com/intro/self-hosting)), while GitHub reports Apache-2.0 for the service repo.
- **SQLite on OPFS:**
  - Official build: `opfs-sahpool` needs no COOP/COEP headers but allows one connection; the `opfs` VFS needs the headers and Safari 17+ ([src](https://sqlite.org/wasm/doc/trunk/persistence.md)).
  - wa-sqlite: PowerSync's May 2026 review recommends its `OPFSCoopSyncVFS`. The IndexedDB VFS degrades past about 100 MB, and OPFS is unavailable in Safari private mode ([src](https://www.powersync.com/blog/sqlite-persistence-on-the-web)).
- **iOS quotas:** up to 60% of disk per origin, including Home Screen web apps. `persist()` is granted by heuristics, with Home Screen status given as an example ([src](https://webkit.org/blog/14403/updates-to-storage-policy/)).
- **7-day cap:** it counts days of Safari use. Home Screen web apps have their own counter and are not expected to lose data ([src](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).
- **Saving to a user-chosen folder:** Chromium only (Chrome/Edge 86+). Firefox's position is negative and Safari opposes it, so not on iOS either ([src](https://web-platform-dx.github.io/web-features-explorer/features/file-system-access)).

## 5. Search

- **FTS5:** the canonical WASM build includes it ([src](https://sqlite.org/forum/forumpost/a9d514c14a26702d?raw)); confirm with `PRAGMA compile_options`. It supports phrase queries and a trigram tokenizer for substrings ([src](https://sqlite.org/fts5.html)), but not regex.
- **MiniSearch** (MIT, 6 KB gzipped): prefix and fuzzy; no phrase search documented ([src](https://github.com/lucaong/minisearch)).
- **FlexSearch** (Apache-2.0, 16 KB): proximity "context" search, no phrase or regex; its benchmarks are self-reported ([src](https://github.com/nextapps-de/flexsearch)).
- **Orama** (Apache-2.0, 24 KB): docs disagree on what `exact` matches.

## 6. Export

| Library | Licence | Gzipped | Note |
|---|---|---|---|
| typst.ts | Apache-2.0 | 7.62 MB + 4.42 MB fonts | browser PDF via `$typst.pdf` ([sizes](https://myriad-dreamin.github.io/typst.ts/cookery/get-started.html), [API](https://myriad-dreamin.github.io/typst.ts/cookery/guide/all-in-one.html)); one release in 12 months |
| pdf-lib | MIT | 173 KB | last release November 2021; `@cantoo/pdf-lib` fork is active |
| PDFKit | MIT | 207 KB | 0.20.2 |
| pdfmake | MIT | 281 KB | |
| react-pdf | MIT | 432 KB | freezes "past a few dozen pages"; use a Worker ([src](https://react-pdf.org/blog/large-documents-in-the-browser)) |
| Paged.js | MIT | 91 KB | last release July 2023; 2.0 rewrite announced ([src](https://pagedjs.org/posts/en/a-new-chapter-in-paged.js-life/)) |
| Vivliostyle | AGPL-3.0 | 232 KB | |
| docx | MIT | 81 KB | active |
| epub-gen-memory | MIT | 55 KB | last release July 2024 |

Sizes are from Bundlephobia, except typst.ts.

## 7. iOS PWA and Tauri

- **Install:** on iOS 26 any site added to the Home Screen opens as a web app ([src](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes)).
- **EU:** Apple reversed its planned removal of Home Screen web apps in March 2024 ([press](https://www.macrumors.com/2024/03/01/apple-walks-back-decision-to-disable-eu-web-apps/)). They remain WebKit-only.
- **Keyboard:** Safari lacks `interactive-widget` ([bug](https://bugs.webkit.org/show_bug.cgi?id=259770)), and `visualViewport` updates late around the keyboard animation ([bug](https://bugs.webkit.org/show_bug.cgi?id=265578)).
- **Memory:** iOS kills pages under memory pressure, then reloads them; one such bug has been open since October 2025 ([bug](https://bugs.webkit.org/show_bug.cgi?id=300782)).
- **Tauri 2:** stable since 2024-10-02. The team was "not completely happy" with mobile developer experience, and not all official plugins support mobile ([src](https://v2.tauri.app/blog/tauri-20/)).

## 8. Frameworks

- First-party bindings favour React: Lexical, Plate and BlockNote ship React bindings, and Tiptap ships React and Vue (no `@tiptap/svelte` exists on npm).
- svelte-tiptap and solid-tiptap are community packages, both released October 2026.
- Zero officially supports React and Solid, with Svelte and Vue from the community ([src](https://zero.rocicorp.dev/docs/community)).
- ProseMirror, CodeMirror, Yjs and Loro are framework-agnostic. I found no evidence beyond bindings.

## Unverified

- **No primary source found:** WriterDuet, Novelcrafter and Notion internals; Scrivener's per-document RTF storage (forum posts only); Beat's pagination internals.
- **Not checked:** Web Worker behaviour on iOS, font subsetting, and 500-page memory use for every export library. These need device tests.
- **Not checked:** iOS/Android IME quality for Lexical, Slate and BlockNote.
- **Unclear:** hardware-keyboard shortcut handling in installed iOS web apps.
- **Bug status not re-checked:** WebKit bugs 259770 and 265578.
- **My inference, not sourced:** regex search by linear scan, and line-counting as the right design for your editor.