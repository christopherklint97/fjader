# Plan

This is the working plan for Fjäder (repository `fjader`). It draws on the research in `docs/research/`, and each work package gets one spec. If a later decision contradicts this file, update this file in the same PR.

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

**Project.** A project is a tree. Inner nodes are folders (part, act, chapter). Leaves are documents, normally one scene each. Every node has a stable id, a parent, an order key that allows inserting between siblings without renumbering, a title, a synopsis, a status, labels and a cached word count.

**Scene-sized documents.** Each leaf document holds its own body. Keeping bodies small is what makes storage, sync, snapshots and rendering cheap. The editor shows consecutive documents as one continuous text (the composite view).

**Format profile.** A project has one format profile. A profile defines the allowed element types, what Enter and Tab do after each element, the autocomplete sources, the layout metrics, and the pagination rules. The schema is strict: a document can contain only its profile's elements.

- `prose`: paragraph, heading, scene break, block quote. Footnotes come with non-fiction support.
- `screenplay`: scene heading, action, character, parenthetical, dialogue, transition, shot, and a dual-dialogue container.
- Later: multi-camera sitcom, stage play (US and UK), audio drama, comic script.

**Inline marks.** Italic, bold, underline, strikethrough, comment anchor, and provenance.

**Provenance.** Every span of text has an origin:

- `typed`: written by the writer. This is the default and stores nothing.
- `ai`: inserted from a model's output, unchanged. The span carries the id of a generation record.
- `ai-edited`: text that started as `ai` and was then edited by the writer. It keeps the generation id.

An `ai` span never returns to `typed`, however much it is edited, because Amazon KDP requires disclosure of AI-generated text "even if you applied substantial edits afterwards" [ai]. A generation record stores the model, provider, date, the prompt as sent, and the reported cost. Open question: pasted text is recorded as `typed`, which the app cannot verify; the disclosure report must say so.

**Story bible.** Entries for characters, locations, objects and lore. Each has a name, aliases, a description, and a context rule for AI requests: always, when mentioned, or never [ai].

**Snapshots.** A snapshot is a named or automatic saved state of one document that can be compared and restored. Snapshots are essential, not optional [prose].

**Our own format.** Fountain cannot carry revisions or locking and has not changed since 2014; FDX has no published schema [script]. The app's model is the source of truth. Fountain, FDX, DOCX and Markdown are import and export formats only.

## 5. Stack

| Part | Choice | Reason | Main risk | Source |
|---|---|---|---|---|
| Language and UI | TypeScript, React 19, Vite, PWA | First-party editor bindings favour React; the core libraries are framework-agnostic. | None specific. | [tech] §8 |
| Editor engine | ProseMirror directly (Tiptap 3's MIT core is the fallback if the wrapper work proves large) | Strict schemas, bindings for all candidate sync libraries, continuing Android fixes, and a report of 1.1M characters handled smoothly. | It has no viewport rendering and the maintainer treats that as out of scope. Cross-scene selection, find and scroll anchoring are ours to build. Spike A decides. | [tech] §1, §2 |
| Body storage | One Yjs 13 document per scene | Phone and laptop edits merge instead of conflicting, which answers Scrivener's sync complaint. Yjs 13 is the mature option. | Yjs 14 and its new ProseMirror binding are pre-release. Loro (built-in time travel) is evaluated only if Yjs falls short in spike B. | [tech] §1, §4; [prose] §1 |
| Database | SQLite compiled to WASM, stored in the Origin Private File System (OPFS), running in a Web Worker | One database for tree, bodies, snapshots, bible, generation log and search. The IndexedDB route degrades past about 100 MB. | OPFS is unavailable in Safari private mode. The `opfs-sahpool` storage layer allows one connection, so multiple tabs need coordination. iOS can kill the page under memory pressure. Spike B decides between `opfs-sahpool` and wa-sqlite's `OPFSCoopSyncVFS`. | [tech] §4, §7 |
| Search | SQLite FTS5 in the same database; linear scan for regular expressions | Phrase queries and a trigram tokenizer for substrings, with no second index to keep in step. | FTS5 has no regex; confirm FTS5 is compiled in with `PRAGMA compile_options`. | [tech] §5 |
| Screenplay pagination | One pure-TypeScript line-counting paginator used by the live editor and the PDF writer, starting from afterwriting's MIT "liner" | Line counting on fixed-pitch text is the usual open-source approach, and one engine guarantees the PDF matches the screen. | Matching Final Draft's page counts exactly; Scrite calls its own live pagination approximate. Spike C decides. | [tech] §3; [script] §7 |
| Script PDF | PDFKit (MIT) in a Worker with Courier Prime (Open Font License) | Small, active, embeds fonts. Courier Prime matches Courier Final Draft metrics. | Worker behaviour and memory on iOS for long documents were not checked. | [tech] §6; [script] §7 |
| Book PDF | Typst compiled to WASM (typst.ts), loaded only when exporting | Prevents widows and orphans and hyphenates by language. | About 12 MB download with fonts; typst.ts is a slow-moving community project; no PDF/X output. | [prose] §6; [tech] §6 |
| DOCX | `docx` (MIT) to write, `mammoth` (BSD-2) to read | Both run in the browser and are active. | mammoth drops visual styling and does not sanitise; sanitise imported HTML ourselves. | [prose] §6 |
| EPUB | Our own EPUB 3 writer on JSZip | The existing generators have low activity. | Must pass EPUBCheck, which is Java; CI runs it against sample books. | [prose] §6 |
| Sync (later) | A small self-hosted server that stores and relays Yjs updates | Fits the local-first decision; the app works without it. | Out of scope until phase 4. | Decision |

Licence compatibility with AGPL-3.0: MIT, BSD, Apache-2.0, MPL-2.0, Open Font License and public-domain code can be used. GPL-3.0 and AGPL-3.0 code can be used (Beat and Starc are GPL-3.0 but not JavaScript, so they are references, not dependencies). Do not copy from GPL-2.0-only code; Trelby is listed as GPL-2.0, so check for "or later" before reading it for more than ideas.

## 6. Performance budgets (proposed targets)

These are proposed targets, not measured results. The test project has 300,000 words in about 600 scenes. The phone figures are for a mid-range phone (iPhone 12 class, or a 2022 mid-range Android), running the installed PWA from a production build. The spikes test them; adjust this table with the spike results.

| Measure | Phone | Desktop |
|---|---|---|
| Open project to an editable cursor at the last position, app already installed | ≤ 1.5 s cold, ≤ 500 ms warm | ≤ 800 ms cold |
| Keystroke latency, input event to next paint, 95th percentile | ≤ 32 ms (99th ≤ 100 ms) | ≤ 16 ms |
| Jump to any scene, from choosing it to text painted and editable | ≤ 200 ms | ≤ 100 ms |
| Project-wide search for a word or phrase, first results shown | ≤ 150 ms | ≤ 80 ms |
| Project-wide regular-expression search | ≤ 1.5 s | ≤ 500 ms |
| Page count updated after an edit (screenplay, 120 pages), off the main thread | ≤ 100 ms | ≤ 50 ms |
| Scroll position shift when scenes mount or unmount | ≤ 1 px | ≤ 1 px |
| JavaScript heap with the project open | ≤ 150 MB | not limited |
| Stored size of the project before snapshots, including search index | ≤ 30 MB | same |
| Typing lost if the app is killed | ≤ 1 s of typing | same |

## 7. Navigation

Moving quickly through a large project is a stated requirement. Phase 1 includes:

- Quick open (one shortcut, one button on phones) over scenes, chapters, characters and locations.
- A tree sidebar with drag-to-reorder; on phones, a bottom sheet.
- Project-wide search with phrase and regex modes, and in-app find that works across scenes that are not on screen. Browser find sees only mounted text, so the app provides its own [tech] §2.
- Bookmarks, back and forward through recent positions, and go-to-page for scripts.
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

- Courier 12 point, 10 characters per inch. The app ships Courier Prime.
- Margins: left 1.5 inches, right 1.0, top 1.0 to the body, bottom 0.5–1.5.
- Dialogue 2.5 inches from each side. Parenthetical at 3.0 inches, about 1.5 inches wide.
- Character name at 4.0–4.2 inches by the Nicholl guide; Final Draft says about 3.7. The sources disagree; make it a profile setting and default to Final Draft's value, because Final Draft is the production standard.
- Page number top right, 0.5 inch down.
- About 54–55 lines per page (derived, unverified).
- Page breaks: a scene heading stays with the text that follows it; a lone line of dialogue moves to the next page; dialogue split across pages gets `(MORE)` and `NAME (CONT'D)`.
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

0. **Spikes.** Prove the risky parts before building. See `docs/spikes/README.md`.
1. **Write, prose first.** Project tree, prose editor, composite view, navigation and search (section 7), snapshots, word targets, focus mode, offline PWA, backup file, DOCX manuscript export, DOCX/Markdown/text import.
2. **Write, scripts.** Screenplay profile, Tab and Enter element cycling, touch element bar, character and location autocomplete, live pagination, PDF, FDX, Fountain.
3. **AI.** Everything in section 9.
4. **Publish.** EPUB, print PDF, more script layouts, cards and outline views, story structure templates.
5. **Sync.** Self-hosted server, multiple devices, comments.
6. **Production.** Revision colours, locked pages and A/B pages, scene numbering, reports, watermarks. Native wrappers only if wanted.

## 11. Known limits

- **PDF/X:** IngramSpark requires it and no browser library found produces it. KDP does not require it. A server-side step would be needed later [prose].
- **EPUBCheck:** it is Java, so it runs in CI against sample books and not in the app [prose].
- **FDX:** no public schema. Round-trips need testing in a real copy of Final Draft, which needs the user [script].
- **Real devices:** editor, storage and export behaviour on iOS and Android has not been tested; that is what the spikes are for [tech].
- **Saving to a folder:** only Chromium browsers let a web app write to a user-chosen folder. Elsewhere, backup is a downloaded file [tech] §4.
- **Competitor sentiment:** praise and complaints come mostly from secondary sources [prose] [script] [ai].

## 12. Repository rules

- **CI.** All checks and image builds run in GitHub Actions: lint, typecheck and tests on PRs; cheap jobs gate expensive ones; superseded runs are cancelled; docs-only changes skip CI; dependency caches are keyed on lockfiles; visual regression runs weekly on main only. A public repository gets one `main` ruleset: no deletion or force pushes, PRs required, squash only, required checks.
- **Secrets.** None are committed. The app itself needs none; the writer's OpenRouter key lives only on their device.
