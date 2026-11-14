# Plan

This is the working plan for Fjäder (repository `fjader`). It draws on the research in `docs/research/` and on the three spikes, whose outcomes are in section 13. Each work package gets one spec; the Phase 1 specs and the architecture decisions they share are in `docs/specs/`. If a later decision contradicts this file, update this file in the same PR.

Research files, cited below by short name:

- **[prose]** `docs/research/prose-publishing.md`
- **[script]** `docs/research/screenwriting.md`
- **[ai]** `docs/research/ai-openrouter.md`
- **[tech]** `docs/research/editor-storage-tech.md`

Facts the research marks as unverified stay unverified here.

## 1. What we are building

One app for long-form writing: novels, non-fiction books, short stories, screenplays, TV scripts and stage plays. It is a web app that installs as a PWA, works fully offline, stays fast with 500+ pages, exports industry formats, and offers AI help through the writer's own OpenRouter key.

The research found no product that combines Scrivener's organisation, Final Draft's script formatting, Vellum's output quality, an offline-capable web app, and bring-your-own-key AI [prose] [script]. Two small open-source script editors appeared in 2026 (OpenDraft, DraftLine, both MIT) [script]; neither covers prose or publishing. Read both before building the screenplay editor.

## 2. Decisions already made

| Decision | Choice | Decided by |
|---|---|---|
| Licence | AGPL-3.0 | User, 2026-11-11 |
| Hosting model | Local-first. Optional self-hosted sync comes later. No accounts and no hosted service. | User, 2026-11-11 |
| Order | Novels and prose get the polish first in phase 1; screenplays second. | User, 2026-11-11 |
| Name | Fjäder; repository `fjader` | User |

## 3. What the research says to copy

- **Structure (Scrivener):** a project is a tree of small documents, read and edited as one continuous text, with cards and an outline over the same data [prose].
- **Script editing (Final Draft, Fade In, WriterDuet):** Tab and Enter cycle the element type; characters and locations autocomplete. On touch devices an element bar sits above the keyboard [script].
- **Page accuracy:** screenplay page count is a production metric. Page breaks must be real while typing and identical in the PDF [script] [tech].
- **AI (Novelcrafter, NovelAI, Sudowrite):** the writer directs small steps, picks from several candidates, and can see exactly what is sent to the model [ai].
- **Avoid:** Scrivener's two most-complained-about areas are its Compile (export) setup and sync conflicts [prose]. One-click chapter drafting and opaque automatic context selection are gimmick-prone [ai] (the researcher's synthesis, not a measured consensus).

## 4. Document model

**Project.** A project is a tree. Inner nodes are folders (part, act, chapter). Leaves are documents, normally one scene each. Every node has a stable id, a parent, an order key that allows inserting between siblings without renumbering, a title, a synopsis, a status, labels and a cached word count. Deleted nodes go to a Trash and can be restored.

**Scene-sized documents.** Each leaf document holds its own body. Keeping bodies small is what makes storage, sync, snapshots and rendering cheap. The editor shows consecutive documents as one continuous text (the composite view). Spike A decided how: each scene is its own editor, and only the scenes near the viewport are in the page. Text does not cross a scene boundary through ordinary typing; scenes are split and merged by explicit commands.

**Format profile.** A project has one format profile. A profile defines the allowed element types, what Enter and Tab do after each element, the autocomplete sources, the layout metrics, and the pagination rules. The schema is strict: a document can contain only its profile's elements.

- `prose`: paragraph, heading, scene break, block quote. Footnotes come with non-fiction support.
- `screenplay`: scene heading, action, character, parenthetical, dialogue, transition, shot, and a dual-dialogue container.
- Later: multi-camera sitcom, stage play (US and UK), audio drama, comic script.

**Inline marks.** Italic, bold, underline, strikethrough, and provenance. A comment anchor is added with comments in phase 5.

**Provenance.** Every span of text has an origin:

- `typed`: written by the writer. This is the default and stores nothing.
- `ai`: inserted from a model's output, unchanged. The span carries the id of a generation record.
- `ai-edited`: text that started as `ai` and was then edited by the writer. It keeps the generation id.

An `ai` span never returns to `typed`, however much it is edited, because Amazon KDP requires disclosure of AI-generated text "even if you applied substantial edits afterwards" [ai]. A generation record stores the model, provider, date, the prompt as sent, and the reported cost. Open question: pasted text is recorded as `typed`, which the app cannot verify; the disclosure report must say so. The provenance mark and its rules are part of the phase 1 document schema (`docs/specs/architecture.md` section 4.3), so the AI phase migrates no stored text.

**Story bible.** Entries for characters, locations, objects and lore. Each has a name, aliases, a description, and a context rule for AI requests: always, when mentioned, or never [ai].

**Snapshots.** A snapshot is a named or automatic saved state of one document that can be compared and restored. Snapshots are essential, not optional [prose]. Restoring writes the old content into the document as a new change, so it can be undone and stays valid for sync.

**Our own format.** Fountain cannot carry revisions or locking and has not changed since 2014; FDX has no published schema [script]. The app's model is the source of truth. Fountain, FDX, DOCX and Markdown are import and export formats only.

## 5. Stack

| Part | Choice | Reason | Main risk | Source |
|---|---|---|---|---|
| Language and UI | TypeScript, React 19, Vite, PWA | First-party editor bindings favour React; the core libraries are framework-agnostic. | None specific. | [tech] §8 |
| Editor engine | ProseMirror directly, one editor per scene, with only the scenes near the viewport mounted | Strict schemas, bindings for all candidate sync libraries, continuing Android fixes. Spike A: a single editor for the whole project failed the typing budget in Chromium; per-scene editors passed every budget in both engines unthrottled. | Cross-scene selection, undo, find and scroll anchoring are ours to build (4 to 9 weeks in Spike A's estimate). Scroll corrections during iOS momentum scrolling are untested. | [tech] §1, §2; Spike A |
| Body storage | One Yjs 13 document per scene, bound to the editor with y-prosemirror 1.x | Phone and laptop edits merge instead of conflicting, which answers Scrivener's sync complaint. Yjs 13 is the mature option and met every threshold in Spike B, so Loro was not evaluated. | Yjs 14 and its new ProseMirror binding are pre-release. The editor and Yjs were measured separately; phase 1 measures them together. | [tech] §1, §4; [prose] §1; Spike B |
| Database | The official SQLite WASM build with the `opfs-sahpool` storage layer in a Web Worker: one database per project, write-ahead logging, one Web Lock per project | One database per project for tree, bodies, snapshots, bible and generation log. Spike B: write batches of 0.3 to 0.5 ms, no corruption in 128 kills, at most 300 ms of typing lost. No cross-origin isolation headers are needed. The IndexedDB route degrades past about 100 MB. | OPFS is unavailable in Safari private mode. One connection, so a project is open in one tab at a time. Behaviour on real phones (memory kills, long suspension, eviction) is untested. | [tech] §4, §7; Spike B |
| Search | A scan of each scene's stored plain text, in the storage worker; regular expressions in a separate worker with a time limit. No full-text index. | Spike B: scanning 300,000 words takes 7 to 25 ms, far inside the budget, and the trigram index alone was 5.1 MB of an 11.2 MB database. Find needs the scan anyway to locate each match. | No relevance ranking and no accent-insensitive matching. If projects outgrow the scan, an FTS5 index over the stored text is one migration away. | [tech] §5; Spike B; `docs/specs/architecture.md` §9 |
| Screenplay pagination | One pure-TypeScript line-counting paginator in a Worker, used by the live editor and the PDF writer, starting from Spike C's `fd` rule set (afterwriting's MIT "liner" extended with Final Draft's rules) | Line counting on fixed-pitch text is the usual open-source approach, and one engine guarantees the PDF matches the screen. Spike C: identical page counts to Final Draft 8 on three public scripts, and PDF pages identical to the screen row for row. | Compared with Final Draft 8 exports only. Whether current Final Draft still sets Courier at 6.995 pt per character (61 characters per action line, not 60) is unknown. | [tech] §3; [script] §7; Spike C |
| Script PDF | PDFKit (MIT) in a Worker with Courier Prime (Open Font License) | Small, active, embeds fonts. Courier Prime matches Courier Final Draft metrics. Spike C: 120 pages in 0.25 to 0.62 s in desktop browsers. | Worker behaviour and memory on iOS for long documents were not checked. | [tech] §6; [script] §7; Spike C |
| Book PDF | Typst compiled to WASM (typst.ts), loaded only when exporting | Prevents widows and orphans and hyphenates by language. | About 12 MB download with fonts; typst.ts is a slow-moving community project; no PDF/X output. | [prose] §6; [tech] §6 |
| DOCX | `docx` (MIT) to write, `mammoth` (BSD-2) to read | Both run in the browser and are active. | mammoth drops visual styling and does not sanitise; imported HTML is parsed into an inert document and reduced to an allow-list of elements, and is never inserted into the page. | [prose] §6 |
| EPUB | Our own EPUB 3 writer on JSZip | The existing generators have low activity. | Must pass EPUBCheck, which is Java; CI runs it against sample books. | [prose] §6 |
| Sync (later) | A small self-hosted server that stores and relays Yjs updates | Fits the local-first decision; the app works without it. | Out of scope until phase 4. | Decision |

Licence compatibility with AGPL-3.0: MIT, BSD, Apache-2.0, MPL-2.0, Open Font License and public-domain code can be used. GPL-3.0 and AGPL-3.0 code can be used (Beat and Starc are GPL-3.0 but not JavaScript, so they are references, not dependencies). Do not copy from GPL-2.0-only code; Trelby is listed as GPL-2.0, so check for "or later" before reading it for more than ideas.

## 6. Performance budgets

These are targets. The spikes met them in headless desktop browsers on a small arm64 host (section 13); **none has been measured on a real phone**. The test project has 300,000 words in about 600 scenes, one of them 10,000 words long. The phone figures are for a mid-range phone (iPhone 12 class, or a 2022 mid-range Android), running the installed PWA from a production build. Phase 1 holds every package to this table with an automated test (`docs/specs/architecture.md` section 13).

| Measure | Phone | Desktop |
|---|---|---|
| Open project to an editable cursor at the last position, app already installed | ≤ 1.5 s cold, ≤ 500 ms warm | ≤ 800 ms cold |
| of which: starting the storage worker to the tree loaded | ≤ 300 ms | same |
| Keystroke latency, from the key event to the first frame after the edit is applied, 95th percentile | ≤ 32 ms (99th ≤ 100 ms) | ≤ 16 ms |
| Jump to any scene, from choosing it to text painted and editable | ≤ 200 ms | ≤ 100 ms |
| Load one scene's document from storage, including one with 200 logged changes | ≤ 50 ms | same |
| Project-wide search for a word or phrase, first results shown | ≤ 150 ms | ≤ 80 ms |
| Project-wide regular-expression search | ≤ 1.5 s | ≤ 500 ms |
| Page count updated after an edit (screenplay, 120 pages), off the main thread | ≤ 100 ms | ≤ 50 ms |
| Scroll position shift when scenes mount or unmount | ≤ 1 px | ≤ 1 px |
| No blank area during a fast scroll for longer than | 100 ms | 100 ms |
| Write batch in the storage worker, 95th percentile | ≤ 20 ms | same |
| Snapshot one scene | ≤ 50 ms | same |
| Restore one scene from a snapshot | ≤ 100 ms up to 3,000 words; ≤ 250 ms for 10,000 words | same |
| Returning to the app after a minute in another app | same position, no reload (manual check) | not applicable |
| JavaScript heap with the project open (automated guard) | ≤ 50 MB | ≤ 50 MB |
| Stored size of the project before snapshots | ≤ 30 MB | same |
| Typing lost if the app is killed | ≤ 1 s of typing | same |

Changes from the proposed table, each from a spike finding:

- The heap limit of 150 MB did not discriminate: every editor variant stayed under 10 MB (Spike A). It is now a 50 MB guard, and the memory question that matters on a phone, whether the app survives being backgrounded, is a manual check.
- Keystroke latency now says where the clock starts and stops. On a 60 Hz screen up to one refresh interval of the 32 ms is waiting for the frame (Spike A).
- Storage budgets (tree, document load, write batch, snapshot, restore) are the thresholds Spike B tested and passed. A document's change log is folded into its stored state at 200 changes or 32 KB, which is what keeps loading inside 50 ms.
- Restore for a 10,000-word scene is allowed 250 ms: restoring as a new change, which undo and sync need, took 78 to 182 ms in Spike B.
- One known miss: typing in a 10,000-word scene at four times CPU slowdown had a 95th percentile of 44 ms (Spike A). Four times slowdown of the test host is slower than the target phones, so the budget stands and the phone check decides.

## 7. Navigation

Moving quickly through a large project is a stated requirement. Phase 1 includes:

- Quick open (one shortcut, one button on phones) over scenes and chapters. Characters and locations join it when the story bible is built.
- A tree sidebar with drag-to-reorder; on phones, a bottom sheet.
- Project-wide search with phrase and regex modes, and in-app find that works across scenes that are not on screen. Browser find sees only mounted text (3,832 of 300,000 words in Spike A's check), so the app handles the find shortcut itself [tech] §2.
- Bookmarks, and back and forward through recent positions. Go-to-page for scripts comes with the screenplay profile in phase 2.
- Split view on wide screens (Scrivener allows up to four editors [prose]; start with two).

## 8. Formats

### Export and import matrix

| Kind | Export | Import |
|---|---|---|
| Manuscripts | DOCX in standard manuscript format | DOCX, Markdown, plain text, split into chapters and scenes |
| Books | EPUB 3; print PDF at KDP trim sizes | same |
| Scripts | PDF, Final Draft FDX, Fountain | FDX, Fountain |
| Whole project | One backup file containing everything | The same file |

Import splitting follows what competitors do [prose] §5: split on Heading 1, on page breaks, on "Chapter N" lines, and on scene-break lines (`#` or `***`), then let the writer correct the result.

### Standard manuscript format (Shunn) [prose] §4

- 12 pt Times New Roman ("modern") or Courier ("classic"), double-spaced, 1 inch margins, 0.5 inch first-line indent, left-aligned.
- First page: contact block top-left; word count top-right, rounded to the nearest 100; title a third to halfway down.
- Header top-right from page 2: surname / title keyword / page number.
- Scene break: a centred `#`. Italics, not underline. "END" is optional.
- Novels: a separate title page, and each chapter starts on a new page.
- File type: Shunn names none. Clarkesworld accepts RTF or DOCX. That agents prefer DOCX is unverified.

### EPUB [prose] §4

| Store | Requirement |
|---|---|
| Amazon KDP | Recommends DOCX, KPF or EPUB. Cover ideally 2560×1600, JPEG or TIFF. |
| Apple Books | EPUB 3.3; must pass the latest EPUBCheck (from search snippets). Cover at least 1400 px on the short side; interior images at most 5.6 MP. |
| Kobo | EPUB 2.0.1 to 3.3; cover 3:4. |
| Google Play Books | EPUB 3.3 preferred. |
| Draft2Digital | Accepts EPUB; size limit 90 MB or 100 MB depending on the page. |
| IngramSpark | EPUB 3.0 required; images at most 3.2 MP; cover at least 1600 px on the short side. |

Target: one EPUB 3 file that passes EPUBCheck and meets the strictest image limits above. Pop-up footnotes use `epub:type="footnote"`.

### Print PDF [prose] §4

- **KDP:** trim sizes from 5×8 inches to 8.5×11 inches. Inside margin (gutter) by page count: 0.375 inch for 24–150 pages, 0.5 for 151–300, 0.625 for 301–500, 0.75 for 501–700, 0.875 for 701–828. Outside margins at least 0.25 inch, or 0.375 with bleed. Bleed is 0.125 inch. Fonts embedded, 300 DPI images, single pages, no crop marks. KDP does not mention PDF/X.
- **IngramSpark:** PDF/X-1a:2001 or PDF/X-3:2002, all fonts embedded, 0.125 inch bleed on three edges, 0.5 inch margins. Not reachable in the browser; see Known limits.

### US feature screenplay [script] §4, §5

- Courier 12 point, nominally 10 characters per inch. The app ships Courier Prime. Final Draft 8 sets characters 6.995 pt apart, not 7.2 pt, so its action line holds 61 characters, not 60 (Spike C); the pitch is a profile setting, and current Final Draft's value is still to be measured.
- Margins: left 1.5 inches, right 1.0, top 1.0 to the body, bottom 0.5–1.5.
- Dialogue 2.5 inches from each side. Parenthetical at 3.0 inches, about 1.5 inches wide.
- Character name at 4.0–4.2 inches by the Nicholl guide; Final Draft says about 3.7, and Final Draft 8's default template has 3.5 (Spike C). The sources disagree; make it a profile setting and default to Final Draft's value, because Final Draft is the production standard. The indent changes a page break only when a name is wider than its column.
- Page number top right, 0.5 inch down.
- 54 lines per page (9 inches at 6 lines per inch). Spike C confirmed it against Final Draft 8: 53 or 55 changes Big Fish's page count by 2.
- Page breaks: a scene heading stays with the text that follows it; a lone line of dialogue moves to the next page; dialogue split across pages gets `(MORE)` and `NAME (CONT'D)`, which take no body line; action and dialogue split at sentence ends, with at least two lines on each side. These rules, read from Final Draft 8's output, are settings of the profile (Spike C, section 3).
- Scene numbers (shooting scripts only): 0.75 inch from the left edge and 1 inch from the right.
- Submission: the Nicholl contest takes PDF only, 12-point Courier, 70–160 pages.

Other layouts (one-hour TV, multi-camera, stage, audio, comics) are profiles added in phase 3. Several of their conventions are unverified or have no governing standard [script] §5; verify each against a primary source when it is built.

## 9. AI through OpenRouter

**Principles from the evidence [ai] §2.** The studies support ideas and options on demand better than drafted prose. AI suggestions reduce the writer's sense of ownership and make stories more alike. No controlled trial of AI, or of freewriting, for blocked fiction writers was found; the evidence for the non-AI block tools is thin. So: the writer asks, the app offers several small candidates, nothing is inserted without a choice, and everything inserted is marked.

**Connection.** The writer signs in to OpenRouter with the PKCE flow: the app opens `https://openrouter.ai/auth` with a callback and an S256 challenge, then exchanges the code at `POST /api/v1/auth/keys`. The key stays on the device and is never synced. Requests go straight from the browser to OpenRouter; no server of ours sees the manuscript. Cross-origin access is not documented but a preflight probe returned `access-control-allow-origin: *`. Pasting a key by hand is also allowed.

**Tools, in order.**

1. "What could happen next": three to five option cards.
2. Describe, and rewrite a selection.
3. Questions about the writer's own story, including character interviews.
4. Scene beats to prose, as candidate cards.
5. Feedback on a scene or chapter.

No one-click chapter generation.

**Context.** The request is assembled from the text before the cursor, linked earlier scenes, and story-bible entries chosen by each entry's rule (always, when mentioned, never). A preview shows the exact prompt and an estimated cost before sending. Keep the stable part of the prompt first so provider caching applies; Anthropic models need `cache_control` markers [ai] §4.

**Provenance and rules.** See the document model. The app can export a disclosure report per project (how much text is `ai` and `ai-edited`, which models, when) and can lock a project to "no AI". This serves KDP's disclosure rule, the US Copyright Office's disclosure requirement, the WGA's terms, and contests such as the Nicholl, which bars AI-generated dialogue, characters or scene description [ai] §3.

**API handling [ai] §4.**

- Streaming is server-sent events with comment lines and a final `[DONE]`. An error after the stream starts arrives as a chunk with `finish_reason: "error"` under HTTP 200.
- Cancelling stops billing only on some providers.
- The last stream chunk reports `usage` with `cost`; store it on the generation record.
- The model picker reads `GET /api/v1/models` (context length, pricing, supported parameters, `is_moderated`).
- A privacy switch sets `provider.data_collection: "deny"` and `provider.zdr: true`; if no provider qualifies the request fails with 503, and the app must say why.
- Handle 401, 402, 403 (moderation), 408, 429, 502, 503 and `finish_reason: content_filter`. Moderated models refuse dark fiction; offer a fallback model.
- Assistant prefill is model-dependent; do not rely on it.
- Send the attribution headers `HTTP-Referer`, `X-OpenRouter-Title` and `X-OpenRouter-Categories`.
- The browser flow cannot set a spend limit, and the credits endpoint needs a management key. Show what `GET /api/v1/key` returns and the running cost of the session.

**Non-AI block tools.** Session word targets, timed sprints, and focus mode.

## 10. Phases

0. **Spikes.** Prove the risky parts before building. See `docs/spikes/README.md`. The automated parts are done; the outcomes and the checks still open on real devices are in section 13.
1. **Write, prose first.** Project tree, prose editor, composite view, navigation and search (section 7), snapshots, word targets, focus mode, offline PWA, backup file, DOCX manuscript export, DOCX/Markdown/text import. Specified as 18 work packages in `docs/specs/`.
2. **Write, scripts.** Screenplay profile, Tab and Enter element cycling, touch element bar, character and location autocomplete, live pagination, PDF, FDX, Fountain.
3. **AI.** Everything in section 9.
4. **Publish.** EPUB, print PDF, more script layouts, cards and outline views, story structure templates.
5. **Sync.** Self-hosted server, multiple devices, comments.
6. **Production.** Revision colours, locked pages and A/B pages, scene numbering, reports, watermarks. Native wrappers only if wanted.

## 11. Known limits

- **PDF/X:** IngramSpark requires it and no browser library found produces it. KDP does not require it. A server-side step would be needed later [prose].
- **EPUBCheck:** it is Java, so it runs in CI against sample books and not in the app [prose].
- **FDX:** no public schema. Round-trips need testing in a real copy of Final Draft, which needs the user [script].
- **Real devices:** editor, storage and export behaviour on iOS and Android has still not been tested. The spikes ran in headless desktop browsers; their phone checklists are open (section 13) [tech].
- **One tab per project:** the storage layer allows one connection, so a project opened in a second tab waits until the first closes it (Spike B).
- **Find on Page in Safari's share sheet** cannot be intercepted and sees only the scenes near the viewport; the app's own find covers the whole project (Spike A).
- **Screen readers** can read continuously only through the scenes near the viewport; every scene is reachable, but the rest of the text is not in the page (Spike A).
- **Saving to a folder:** only Chromium browsers let a web app write to a user-chosen folder. Elsewhere, backup is a downloaded file [tech] §4.
- **Competitor sentiment:** praise and complaints come mostly from secondary sources [prose] [script] [ai].

## 12. Repository rules

- **CI.** All checks and image builds run in GitHub Actions: lint, typecheck and tests on PRs; cheap jobs gate expensive ones; superseded runs are cancelled; docs-only changes skip CI; dependency caches are keyed on lockfiles; visual regression runs weekly on main only. A public repository gets one `main` ruleset: no deletion or force pushes, PRs required, squash only, required checks.
- **Secrets.** None are committed. The app itself needs none; the writer's OpenRouter key lives only on their device.
- **Hosting.** The built app is static files and needs no special response headers (Spike B). Where it is hosted, and at which permanent address, is an open decision recorded in `docs/specs/README.md`.

## 13. Spike outcomes

The three spikes of phase 0 have run. Their findings are in `docs/spikes/results/`. Everything below was measured in headless Chromium and WebKit on one small arm64 host, with a 300,000-word, 600-scene test project.

### What was decided

| Spike | Decision | The numbers that decided it |
|---|---|---|
| A, editing at scale | One ProseMirror editor per scene, with only the scenes within two viewport heights mounted. | A single editor for the whole project: keystroke 95th percentile 32 to 34 ms unthrottled and 157 to 182 ms at four times CPU slowdown in Chromium, against a 32 ms budget, and 3.1 s to open at four times slowdown. A single editor with `content-visibility`: passed in Chromium, but in WebKit typed text landed in the wrong chapter and the page jumped 28 px. Per-scene editors: 7 to 8 ms keystrokes, 0.23 s to open, jumps in at most 27 ms, 0.00 px scroll shift, 840 DOM elements instead of 6,861. |
| B, storage | The official SQLite WASM build with `opfs-sahpool`, write-ahead logging, one Web Lock per project; one Yjs document per scene; changes written in 250 ms batches and flushed when the page is hidden; a scene's change log folded into its state at 200 changes or 32 KB. | Write batch 95th percentile 2.1 ms (Chromium) and 1 ms (WebKit) against 20 ms; tree loaded 223 and 263 ms after starting the worker against 300 ms; 128 kills with no corruption and at most 300 ms of typing lost against 1 s. The two storage layers that need cross-origin isolation headers failed (write batches of 111 and 155 ms), so no such headers are needed. A whole-project substring scan took 7 to 25 ms, which is why phase 1 has no full-text index. |
| C, screenplay pagination | One TypeScript line-counting paginator in a Worker feeds the editor and a PDFKit writer, starting from the spike's `fd` rule set. | Same page counts as Final Draft 8 on three public scripts (4, 20 and 120 pages), 115 of 120 pages identical on the longest; PDF pages identical to the screen on every page tested; 1.5 to 3 ms in the worker per edit at 120 pages against 100 ms. |

### Where the spikes contradicted this plan

- Search: no FTS5 index (section 5).
- Budgets: the heap budget did not discriminate, the keystroke budget needed a definition, and storage budgets were missing (section 6).
- Screenplay format: 54 lines per page is confirmed; the character pitch that reproduces Final Draft is 6.995 pt, not 7.2 pt (section 8).
- Browser find cannot be relied on at all, and undo across scenes has to be built (sections 5 and 7).

### Open risks

1. **No real phone has been tested.** The pass thresholds are defined on phones, and the three phone checklists in the findings have not been run. Unknown until they are: typing with an on-screen keyboard, autocorrect, dictation and composition; whether correcting the scroll position stops iOS momentum scrolling; selection handles at a scene boundary; the keyboard's effect on the layout; storage speed, kills, long suspension, eviction and `persist()` on iOS and Android; PDF export memory on phones. `docs/specs/architecture.md` section 17 isolates each of these in one module and says what changes if a check fails.
2. **The Final Draft comparison is against version 8 exports only** (PDFs published in 2012). Whether current Final Draft uses the same character pitch and the same `(MORE)` and parenthetical rules is unknown, and the rules were fitted on the same three scripts they were measured on. This must be closed before phase 2, and does not affect phase 1.
3. **The editor and Yjs have not been measured together.** Spike A used editors without Yjs; Spike B used Yjs without editors. The first phase 1 editor package measures the combination against the budgets.
4. **Very long scenes.** Typing in a 10,000-word scene missed the budget at four times CPU slowdown (44 ms). If phones show it, the remedy is to cap how much of a long scene one editor holds.
5. **Touch selection across scenes** is not solved; phase 1 accepts selection within one scene on touch.
