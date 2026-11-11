# Long-form writing software and export requirements: research report (2026-11-10)

## Conclusions

- **Structure to copy:** a tree of small documents, a composite "read as one" view, and cards/outline over the same data. Scrivener's most-complained-about areas are Compile and Dropbox sync.
- **Gap in the market:** no product found combines Scrivener-depth organisation, Vellum-grade output and an offline-capable web app. Atticus is the only PWA formatter, and it imports .docx only.
- **Export targets:** DOCX in Shunn format, EPUB 3 passing EPUBCheck, and PDF/X-1a:2001 with all fonts embedded.
- **Client-side stack:** `docx`, `mammoth`, a hand-rolled EPUB (JSZip) and Typst-WASM all run in the browser. No browser-side tool I found emits PDF/X, and EPUBCheck is Java (not checked this session), so both need a server step or a waiver.

## 1. Products

| Product | Price | Platforms / sync | Praised | Complaints |
|---|---|---|---|---|
| Scrivener 3 | $59.99 per desktop platform, one-time (third-party figure); iOS $23.99 ([store](https://www.literatureandlatte.com/store/scrivener)) | Mac, Windows, iOS; no Android or web listed; Dropbox sync for iOS | Binder, corkboard, snapshots, targets | Compile ([forum](https://forum.literatureandlatte.com/t/compile-is-a-confusing-mess/153286)); sync conflicts ([forum](https://forum.literatureandlatte.com/t/constant-sync-conflicts/130300)) |
| Ulysses | $5.99/mo or $39.99/yr ([pricing](https://ulysses.app/pricing/)) | Mac, iPad, iPhone; iCloud | Clean Markdown editor | Price; less planning than Scrivener ([Capterra](https://www.capterra.com/p/238800/Ulysses/reviews/)) |
| Atticus | $147 one-time ([site](https://www.atticus.io/)) | PWA, works offline, cloud backup | Write and format in one tool; EPUB/PDF/DOCX export | Clunkier than Vellum, small bugs (unverified, affiliate-heavy sources); version history "coming soon" |
| Vellum | $199.99 ebooks, $249.99 with print ([site](https://vellum.pub/)) | Mac only | Output quality, live preview, widow handling | Mac-only, price, not a writing tool |
| Dabble | $15/$23/$39 per month billed annually; lifetime $699/$899 ([pricing](https://www.dabblewriter.com/pricing)) | Any device; cloud sync with local offline copy | Plot Grid, interface | Price; weak export, and sources disagree on whether it exports EPUB ([Reedsy review](https://reedsy.com/studio/resources/dabble-writing-review)) |
| Novelcrafter | $4–$20/mo, no free plan ([pricing](https://www.novelcrafter.com/pricing)) | Web | Codex, plan grid, matrix | No EPUB/PDF export; learning curve (third-party, unverified) |
| LivingWriter | $19.99/mo or $149/yr (unverified; vendor page unreadable) | Web, mobile apps (unverified) | Templates | Sync-loss reports, second-hand ([Chapter](https://blog.chapter.pub/livingwriter-review/)) |
| Plottr | $60/yr or $150 lifetime; Pro $99/yr ([pricing](https://plottr.com/pricing/)) | Desktop; Pro adds browser app and cloud sync | Timelines, templates, Word/Scrivener export | Rigid templates ([Capterra](https://www.capterra.com/p/264561/Plottr/reviews/)) |
| Campfire | Free up to 25k words; $12/mo ([pricing](https://www.campfirewriting.com/pricing)) | Browser, desktop, mobile app | World-building modules | Pricing complexity; mobile lacks modules |
| Reedsy Studio | Free core; add-ons $4.99 and $7.99/mo ([site](https://reedsy.com/studio)) | Web only; no offline (third-party) | Free EPUB and print PDF, collaboration | Few themes; DOCX export disputed between sources |
| Ellipsus | Free plus a Plus tier ([plus](https://ellipsus.com/plus)) | Web; offline partial; native apps disputed | No generative AI, drafts and merge | No EPUB export found |
| Obsidian + Longform | Free plugin | Wherever Obsidian runs | Scenes, compile workflow, goals | "Falls short" on research/appearance ([forum](https://forum.obsidian.md/t/my-long-form-writing-setup/74752)) |

Open-source and free tools (versions and dates from the GitHub API):

- **novelWriter:** GPL-3.0, v26.2.2 (Oct 2026), active, desktop only, plain-text storage. The repo has moved to [saga-soft/novelWriter](https://github.com/saga-soft/novelWriter).
- **Manuskript:** GPL-3.0, 0.17.0 (Jun 2025), commits this month, 592 open issues ([repo](https://github.com/olivierkes/manuskript)).
- **bibisco:** GPL-3.0 community edition; last push Sep 2024, so it looks stale. A paid Supporters Edition exists ([repo](https://github.com/andreafeccomandi/bibisco)).
- **Longform:** v2.1.0 (Mar 2025), last push Dec 2025. Its "Fuck Around and Find Out License v0.2" is non-standard ([repo](https://github.com/kevboh/longform)).
- **Wavemaker:** free PWA; GitHub detects no licence on its repos, so it is not clearly open source (unverified) ([repo](https://github.com/wavemakercards/wavemaker-v5)).
- **yWriter:** free, closed; Windows, Android, iOS; Dropbox for mobile ([site](https://www.spacejock.com/yWriter.html)).

## 2. Organisation model

- **Scrivener's model:** binder of sections of any size, Scrivenings (edit several as one), corkboard synopsis cards, outliner with word counts and metadata, up to four split editors. The vendor rationale is "Working on a long text is easier when you break it into smaller pieces" ([features](https://www.literatureandlatte.com/scrivener/features)).
- **Why it works:** I found only vendor and user testimony, no independent study.
- **Navigation:** Quick Search opens a document by title, and project bookmarks are reachable from any document ([L&L blog](https://www.literatureandlatte.com/blog/use-bookmarks-in-scrivener-projects-to-link-to-internal-and-external-files)).
- **Ulysses sheets/groups:** not verified; the features page returned 404.

## 3. Essential vs nice-to-have

This is my inference from which features appear across products and what gets complained about; no survey was found.

- **Essential:** snapshots or version history, manuscript and session targets, focus mode, comments, a characters/locations bible linked to scenes, reliable offline.
- **Often paywalled:** track changes (Dabble puts it in the Author tier).
- **Nice-to-have:** timelines and plot grids, structure templates, streaks, research storage.

## 4. Export requirements

**Manuscript format (Shunn)** ([guide](https://www.shunn.net/format/classic/), [checklist](https://www.shunn.net/format/2024/01/a_brief_manuscript_formatting_checklist.html)):
- 12 pt Times New Roman ("modern") or Courier ("classic"), double-spaced, 1" margins, 0.5" first-line indent, left-aligned.
- Contact block top-left, word count top-right (rounded to nearest 100), title a third to halfway down.
- Header top-right from page 2: surname / title keyword / page number.
- Scene break is a centred "#"; italics rather than underline; "END" optional.
- Novels add a separate title page, and each chapter starts on a new page ([novel](https://www.shunn.net/format/novel/)).
- File type: Shunn names none. Clarkesworld takes ".RTF or .DOCX", "modern preferred, classic accepted" ([guidelines](https://clarkesworldmagazine.com/submissions/)). Agents preferring .docx is third-party only (unverified).

**EPUB by store:**

| Store | Requirement |
|---|---|
| KDP | Recommends DOCX, KPF or EPUB; also takes HTML, RTF, TXT, PDF; MOBI ended for fixed-layout March 2025 ([formats](https://kdp.amazon.com/en_US/help/topic/G200634390)). Cover ideally 2560×1600, JPEG/TIFF ([cover](https://kdp.amazon.com/en_US/help/topic/G200645690)) |
| Apple Books | EPUB 3.3; must pass the latest EPUBCheck (from search snippets of Apple's pages). Cover at least 1400 px on the short side; interior images at most 5.6 MP ([asset guide](https://help.apple.com/itc/booksassetguide/en.lproj/static.html)) |
| Kobo | EPUB 2.0.1 to 3.3; ingests through EPUBCheck 4.2.6; cover 3:4 ([spec](https://github.com/kobolabs/epub-spec)) |
| Google Play | EPUB 3.3 preferred, EPUB 2 accepted; run EPUBCheck ([help](https://support.google.com/books/partner/answer/3316879?hl=en)) |
| Draft2Digital | doc, docx, odt, rtf or epub; size limit is 90 MB or 100 MB depending on which D2D page you read ([FAQ](https://www.draft2digital.com/faq)) |
| IngramSpark | "EPUB 3.0 required"; images at most 3.2 MP; cover at least 1600 px on the short side ([guide](https://www.ingramspark.com/hubfs/downloads/file-creation-guide.pdf)) |

**Print PDF:**
- **KDP** ([trim/margins](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6), [submission](https://kdp.amazon.com/en_US/help/topic/G201857950)):
  - Trim sizes from 5×8" to 8.5×11".
  - Gutter by page count: 0.375" (24–150), 0.5" (151–300), 0.625" (301–500), 0.75" (501–700), 0.875" (701–828).
  - Outside margins at least 0.25", or 0.375" with bleed. Bleed is 0.125" and requires PDF.
  - Fonts embedded, 300 DPI, single pages, no crop marks. PDF/X is not mentioned.
- **IngramSpark** (same guide as above): PDF/X-1a:2001 or PDF/X-3:2002, unembedded fonts rejected, 0.125" bleed on three edges, 0.5" margins, 240% ink limit, no spreads.

**How the tools handle it:** Vellum and Reedsy both emit PDF/X-1a ([Reedsy FAQ](https://reedsy.com/write-a-book/book-writing-software-faq)). Scrivener's difficulty is its layering of section types, section layouts and compile formats.

**Non-fiction and audio:**
- Pop-up footnotes use `epub:type="footnote"` (Kobo spec above).
- Atticus drops endnotes on import.
- I found no store rules for indexes or bibliographies, and no official audiobook-script convention.

## 5. Import

DOCX is the common denominator.

- **Atticus:** .docx only; splits on page break plus Heading 1; `***` becomes a scene break ([help](https://intercom.help/atticus-5877e36564df/en/articles/12622033-how-to-prepare-your-word-document-for-upload)).
- **Dabble:** docx, Markdown, HTML, RTF; splits on "Chapter N" lines and on `#` or `***` ([docs](https://www.dabblewriter.com/docs/import-export-printing/import-your-manuscript)).
- **Scrivener:** Import and Split by heading structure or a separator string ([L&L blog](https://www.literatureandlatte.com/blog/scrivener-and-microsoft-word-importing-exporting)).
- **Vellum:** Heading 1 detection, correctable afterwards ([help](http://help.vellum.pub/importing/)).
- **Reedsy:** DOCX or ODT (third-party).

## 6. Building blocks

| Library | Licence | Latest | Client-side | Limits |
|---|---|---|---|---|
| docx | MIT | 9.15.3, Nov 2026 | Yes (not re-checked this session) | Generation only |
| mammoth | BSD-2 | 1.13.0, Sep 2026 | Yes | Drops visual styling; no sanitisation ([repo](https://github.com/mwilliamson/mammoth.js)) |
| epub-gen-memory / jEpub | MIT / ISC | Jul 2024 / Oct 2025 | Not checked | Low activity; hand-rolling with JSZip is the safer route |
| Typst + typst.ts | Apache-2.0 | 0.15.1, Jul 2026 / 0.7.0, Jun 2026 | Yes, `$typst.pdf` ([docs](https://myriad-dreamin.github.io/typst.ts/cookery/guide/all-in-one.html)) | Prevents widows/orphans and hyphenates by language ([text](https://typst.app/docs/reference/text/text/)); PDF/A and PDF/UA-1 but no PDF/X ([pdf](https://typst.app/docs/reference/pdf/)); fonts must be shipped |
| Paged.js | MIT | 0.4.3, Jul 2023 | Yes, via browser print | 2.0 rewrite announced, thin maintenance ([post](https://pagedjs.org/posts/en/a-new-chapter-in-paged.js-life/)) |
| Vivliostyle | AGPL-3.0 | 2.46.0, Nov 2026 | Layout only | PDF/X-1a needs the CLI and Docker ([docs](https://docs.vivliostyle.org/en/cli/special-output-settings/)) |
| pandoc WASM | GPL-2.0+ | 3.13, Oct 2026 | Yes, since 3.9 ([announcement](https://discourse.haskell.org/t/ann-pandoc-3-9-wasm/13659)) | Copyleft; format coverage in WASM unverified |
| pdfkit | MIT | 0.20.2, Aug 2026 | Yes | PDF/A only; no layout engine ([docs](https://pdfkit.org/docs/getting_started.html)) |
| pdf-lib | MIT | 1.17.1, Nov 2021 | Yes | Stale; the `@cantoo/pdf-lib` fork is at 2.11.1 (Sep 2026) |

The Clarkesworld page contains bot-trap text aimed at LLMs; I ignored it.