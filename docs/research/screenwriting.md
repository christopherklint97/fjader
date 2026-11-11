# Script-writing software and format standards: research report

## Conclusions

- **Production standard is Final Draft; spec writing is tool-agnostic.** Reviewers consistently call Final Draft the industry standard (https://www.g2.com/products/final-draft/reviews). Contests ask for PDF, so any tool that paginates correctly works for spec.
- **Copy the Tab/Enter element model plus autocomplete, and add a touch element bar.** The plan needs a real pagination engine, and lock-pages and revision sets as a later tier.
- **Use your own document model.** Fountain cannot carry revisions or locking, and FDX has no published schema that I could find.
- **One reusable JS pagination codebase exists.** It is afterwriting's "liner" (MIT) and its TypeScript port in betterfountain.
- **Could not verify on primary sources:** Reddit and BBC pages are blocked to my fetcher, and Final Draft's knowledge base returned 403. Those items are marked unverified below.

## 1. Products

| Product | Price / licence | Platforms | Praised | Complaints |
|---|---|---|---|---|
| Final Draft 13 | $249.99 list ($199.99 promo), one-time; Suite with Cloud from $8.33/mo billed annually (https://finaldraft.com/pricing) | Mac, Windows; web (Cloud); iOS "Go" at $3.99/mo | Standard status, production reports, outlining | Price, crashes (G2); iOS scrolling and crashes (https://apps.apple.com/us/app/final-draft-go/id1614876398) |
| Fade In | $79.95, free updates (https://www.fadeinpro.com/page.pl?content=purchase) | Mac, Windows, Linux; mobile companion | No subscription, widest format support, full production set | Weak mobile app (unverified, aggregator) |
| WriterDuet | Free (3 projects); $9.99, $11.99, $13.99/mo (https://www.writerduet.com/article/231-choose-the-best-subscription-for-you) | Web, desktop; mobile unverified | Real-time collaboration | Revisions and page locking only on Pro |
| Arc Studio | Free (2 scripts, watermarked PDF); $69 or $99/yr (https://www.arcstudiopro.com/pricing) | Web, Mac, Windows, iOS; no Android app | Clean interface | Outlining, revisions and inviting collaborators are Pro-only |
| Highland Pro | $9.99/mo or $59.99/yr (https://apps.apple.com/us/app/highland-pro/id6612007609) | Mac, iPad, iPhone | Plain-text Fountain, Revision Mode, Navigator | iOS weaker, iCloud sync, FDX round-trip (https://johnaugust.com/2026/what-i-learned-from-a-year-of-highland-pro) |
| Celtx | Free (1 project), Writer, Writer Pro, Team; prices not shown on the page I could fetch | Web | Pre-production tools | Unverified |
| Scrite | GPLv3 source, paid binaries $19–36/yr (https://www.scrite.io/pricing/) | Windows, Mac, Linux | Structure canvas, Indian languages | No sync or collaboration |
| Beat | GPLv3; macOS free, iOS paid; v2.1.18 May 2026 (https://github.com/lmparppei/Beat) | macOS, iOS | Minimal UI, cards and timeline, plugins | Apple-only; iOS is a companion |
| Starc | GPL-3.0 repo; free, Pro $150 lifetime, Creator $8.34/mo (https://starc.app/pricing) | Desktop, iPhone | Screenplay, comics, audio drama, stage play and novel in one app | Desktop–mobile sync not until 2027 |
| Trelby | GPL-2.0, free; release 2.4.16.2, Oct 2025 (https://github.com/trelby/trelby) | Linux, Windows | Free | Windows build "still in progress" |

- **KIT Scenarist:** superseded by Starc; its repo's last commit was August 2023.
- **Newer entrants:** OpenDraft (MIT, desktop and browser, created March 2026, https://github.com/Proteus-Technologies-Private-Limited/OpenDraft) and DraftLine (MIT PWA, created October 2026, https://github.com/nanashi86/DraftLine).

## 2. Editing model

- **Tab/Enter:** In WriterDuet, Enter after Action gives Action; Tab cycles Action, Character, Dialogue, then back (https://writerduet.helpscoutdocs.com/article/170-change-line-type). Ctrl/Cmd+number sets the type directly.
- **Configurable keys:** Fade In sets Enter, "Tab before" and "Tab after" per element style (https://www.fadeinpro.com/kb/content/3/156/en/enter-and-tab-key-behavior.html).
- **Autocomplete:** Fade In suggests characters, locations, scene intros and times (https://www.fadeinpro.com/page.pl?content=features). Final Draft's SmartType does the same, with Tab accepting a suggestion (search snippet only; page 403).
- **Touch:** Final Draft Go uses an Elements bar on iPad, a menu on iPhone, and a one-finger swipe to change element (App Store listing above).
- **Fountain apps:** Highland and Beat infer the element from the text itself, with `^` for dual dialogue and `.`, `@`, `!` to force a type (https://fountain.io/syntax/).

## 3. Navigation

- **Fade In:** navigator with scene reordering and nested sequences, index cards, colour coding, bookmarks.
- **Beat:** collapsing outline, index cards, timeline, filters, per-character statistics.
- **Highland Pro:** Navigator, Overview, Shelf.
- **Final Draft:** Beat Board, outline tools and eight report types (secondary).
- **Best design:** I found no primary evidence ranking these.

## 4. Production

- **Revision colours** (WGA West, per Final Draft): white, blue, pink, yellow, green, goldenrod, buff, salmon, cherry, then "second blue" (https://kb.finaldraft.com/hc/en-us/articles/15575314119316, snippet). Celtx instead describes wrapping to "double white"; productions vary.
- **Locked pages:** page breaks freeze, inserts become 99A, scene numbers never change, omitted scenes keep their number, changes get margin asterisks, and only changed pages go out (https://johnaugust.com/?p=8379).
- **Page breaks:** a heading stays with its description; a lone dialogue line moves to the next page; split dialogue gets (MORE) and NAME (CONT'D) (Nicholl guide, below).
- **Scene numbers:** 0.75" from the left edge and 1" from the right, shooting scripts only (https://www.finaldraft.com/blog/what-are-the-margins-for-a-screenplay).
- **Fade In also has** editable MORE/CONT'D, breakdown tagging and batch watermarking.

## 5. Format standards

- **US feature** (Nicholl guide, https://www.oscars.org/sites/oscars/files/scriptsample.pdf):
  - Courier 12-point, 10-pitch.
  - Margins: left 1.5", right 1.0", top 1.0" to body, bottom 0.5–1.5".
  - Dialogue 2.5" from each side; parenthetical at 3.0", about 1.5" wide.
  - Character at 4.0–4.2"; Final Draft says about 3.7", so sources disagree.
  - Page number top right, 0.5" down.
  - About 54–55 lines per page (derived, unverified).
- **One-hour TV:** feature format plus act breaks; act lengths are secondary-source only.
- **Multi-camera:** double-spaced dialogue, all-caps action, underlined scene headings, 52–58 pages (https://www.finaldraft.com/blog/differences-single-camera-multi-camera-tv-pilot-scripts). Scene letters and cast lists are unverified.
- **US stage:** 12-point, binding margin 1.5", others 1.0", described as "guidelines, not requirements" (https://www.dramatistsguild.com/script-formats).
- **UK stage:** name at left with dialogue beside it, uppercase action, per WriterDuet's BBC-based template (https://writerduet.helpscoutdocs.com/article/391-uk-stageplay-template).
- **BBC radio format:** unverified.
- **AV and comics:** no governing standard; sources disagree on which AV column holds video.
- **A4:** same inch margins reportedly kept (unverified).

## 6. File formats

- **FDX:** XML since Final Draft 8 (https://www.nationalarchives.gov.uk/PRONOM/fmt/1845); no published schema found. An MIT writer emits `FinalDraft[DocumentType=Script, Version=5] > Content > Paragraph[Type] > Text` (https://github.com/wildwinter/screenplay-tools). I did not test that file in Final Draft.
- **Fountain:** spec 1.1, March 2014, unchanged since. It has no revisions, locking or tags. Beat stores these in a trailing JSON comment block; Highland Pro uses a zipped `.highland` package.
- **Open Screenplay Format:** XML with spec PDFs for v2 and v4; last commit March 2021 (https://github.com/OpenScreenplayFormat/osf-sdk). Fade In's `.fadein` is reportedly a zip of this (third-party).
- **Import/export:**
  - Fade In: FDX, FDR, DOCX, RTF, Fountain, Celtx, Scrivener, OSF, PDF.
  - Arc Studio: imports FDX, Word, PDF, Fountain; exports Fountain, FDX, PDF.
  - Highland Pro: Fountain, FDX, PDF, DOCX.
  - Scrite: imports FDX, Fountain, text, OSF.
- **Submission:** Nicholl takes PDF only, 12-point Courier, 70–160 pages, no identifying details (https://www.oscars.org/nicholl/about, 2024 rules). The Black List's requirements are unverified.

## 7. JS/TS building blocks

| Library | Licence | Latest release / commit | Pagination |
|---|---|---|---|
| afterwriting (https://github.com/ifrost/afterwriting-labs) | MIT | 1.17.3, Dec 2020 / Sep 2024 | Yes, with MORE/CONT'D and break rules |
| betterfountain (https://github.com/piersdeseilligny/betterfountain) | MIT | 1.14.2, Jun 2025 / Sep 2026 | Yes (port of afterwriting); tied to VS Code |
| fountain-js (https://github.com/jonnygreenwald/fountain-js) | MIT | 1.2.4, Nov 2023 | No |
| Fountain.js (https://github.com/mattdaly/Fountain.js) | MIT | none / 2015 | No |
| screenplay-tools | MIT | 0.0.10, Jan 2026 / Oct 2026 | No; Fountain and FDX read/write |

- **GPL code:** Beat and Starc have fuller engines but are GPLv3 and not JavaScript.
- **Fonts:** Courier Prime is under the Open Font License and matches Courier Final Draft metrics (https://quoteunquoteapps.com/courierprime/). Other screenplay fonts were not checked.