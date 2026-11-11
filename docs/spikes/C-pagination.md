# Spike C: screenplay pagination

## Question

Can one pure-TypeScript paginator produce correct screenplay page breaks, keep them current while the writer types, and drive a PDF whose pages match the screen exactly?

## Why it is risky

- Page count is a production metric: one page is treated as about a minute of screen time, and contests set page limits (`docs/research/screenwriting.md`, §5, §6). A wrong count makes the tool unusable for scripts.
- Existing live pagination is weak. Scrite calls its own approximate and leaves it off by default; Tiptap's pagination is paid and in beta; the community extensions are immature (`docs/research/editor-storage-tech.md`, §3).
- Only one reusable JavaScript codebase handles breaks with `(MORE)` and `(CONT'D)`: afterwriting's "liner" (MIT), with a TypeScript port inside betterfountain (MIT) that is tied to VS Code (`screenwriting.md`, §7).
- Sources disagree on one format number (character name at 4.0–4.2 inches or about 3.7), and lines per page (about 54–55) is derived, not sourced (§5).
- Worker behaviour and memory use of PDF libraries on iOS were not checked (`editor-storage-tech.md`, §6).

## Constraints

- TypeScript. The paginator is a pure function with no DOM access: input is a list of elements (type and text) plus a layout profile; output is lines and page breaks. It must run in a Web Worker.
- Start from afterwriting's liner or the betterfountain port. Both are MIT; keep their copyright notices. Do not copy from GPL-2.0-only code.
- PDFKit for the PDF, Courier Prime (Open Font License) embedded.
- US feature screenplay profile only, with the metrics from `docs/PLAN.md`, section 8. The character-name indent and lines per page are profile settings.
- Use a Fountain parser (MIT) only to load test scripts. The Fountain format is not the app's model.
- Code lives in `spikes/C/` and is thrown away, except that a passing paginator is the starting point for the real one.

## What to build

1. **The paginator**, with these rules: fixed-pitch line wrapping per element width; a scene heading stays with the text that follows it; a lone line of dialogue moves to the next page; dialogue split across pages gets `(MORE)` at the bottom and `NAME (CONT'D)` at the top; a parenthetical is not left as the last line before a break; breaks fall at sentence ends where possible; dual dialogue stays side by side.
2. **Incremental mode:** after an edit, re-run from the page containing the edit and stop when the breaks match the previous result again.
3. **A viewer page:** loads a script, shows it with page breaks and page numbers, lets you type into any element, and shows the page count and the time each update took. A plain text area per element is enough; this spike does not need ProseMirror.
4. **A PDF writer** in a Worker that takes the paginator's output and draws it with PDFKit. It must not re-flow anything.
5. **A comparison script** that checks the paginator against reference scripts.

Reference scripts: use scripts that are published for this purpose or that we write ourselves, never copyrighted screenplays. Candidates are the sample scripts published with the Fountain format and the Nicholl formatting sample. Add our own stress script: long dialogue runs, many short scenes, dual dialogue, and elements that land on every break rule.

Reference page breaks come from two places. First, afterwriting's own command-line output for the same script, which can be produced automatically. Second, Final Draft's output for the same script: this needs a person with Final Draft, so it is a manual step for the user and the findings must say whether it was done.

## What to measure

Automated:

- Page count and the position of every page break against the afterwriting reference, per script.
- Editor against PDF: extract the text of each PDF page and compare it with the paginator's pages.
- Full pagination time for a 120-page script and a 500-page stress script, in a Worker, in Chromium and WebKit, with CPU throttled four times.
- Incremental update time for an edit near the start, the middle and the end.
- PDF generation time, peak memory, file size, and whether the font is subset.

Manual, on a real iPhone (installed to the Home Screen) and a real Android phone (Chrome):

- [ ] Load the 120-page script. Type in the middle. Does the page count update without the typing stalling? Note the update time shown.
- [ ] Export the PDF. Does it finish, and does the app survive? Note the time.
- [ ] Open the PDF. Compare three pages chosen at random against the screen: same first and last line?
- [ ] Repeat the export with the 500-page stress script.
- [ ] If Final Draft is available: import the reference scripts, note its page counts and the first line of each page for one script.

## Pass thresholds

- Against the afterwriting reference: identical page count and identical breaks on at least 95% of pages, with every difference explained.
- Against Final Draft, where measured: page count within one page per 100 pages. If not measured, the result is "accuracy against Final Draft unknown", not a pass.
- Editor and PDF: identical page breaks on every page.
- From `docs/PLAN.md`, section 6, on the real phones: page count updated in at most 100 ms after an edit in a 120-page script, off the main thread, with keystroke latency unaffected.
- Full pagination of 120 pages in at most 300 ms on the phones.
- PDF of 120 pages generated in a Worker in at most 3 s on the phones, with Courier Prime embedded, without the page being killed.

## Deliverable

- The demo in `spikes/C/`, with one command to build, one to serve, and one to run the comparison.
- `docs/spikes/results/C.md`: accuracy per script and reference; timings per browser and device; the settings that gave the best match (character indent, lines per page); every break rule and whether it is covered by a test; the dependency list with licences; what failed and why; and one recommendation.

## Out of scope

The ProseMirror screenplay schema, Tab and Enter element cycling, autocomplete, FDX, revisions and locked pages, scene numbers, title pages, A4 paper, other script layouts, and book pagination (that is Typst's job in phase 4).
