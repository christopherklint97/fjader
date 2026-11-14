# Package 15: Import

## Goal

A writer with an existing manuscript gets it into Fjäder, split into chapters and scenes, and can correct the split before anything is created. Formats: DOCX, Markdown and plain text. The splitting rules are those in `docs/PLAN.md` section 8.

## User-visible behaviour

- "Import" on the library screen, and "Import into this project" in the project menu, take a `.docx`, `.md`, `.markdown` or `.txt` file.
- The app reads the file and shows a **preview**: the chapters and scenes it found, as an indented list, each with its title, its word count and its first words. Above the list is a summary ("24 chapters, 61 scenes, 88,400 words") and any warnings.
- **Correcting the split.** Each boundary in the list has a control to remove it, which merges that item with the one before. A setting above the list chooses how scene-break lines are treated: "Start a new scene" (the default) or "Keep as a break inside the scene". Changing it recomputes the list.
- "Create project" makes a new project named after the file (editable) and opens it. From inside a project, "Add to project" appends the imported chapters at the end of the tree.
- **What is kept:** paragraphs, headings, block quotes, italic, bold, underline, strikethrough.
- **What is dropped, with a warning that counts them:** images, tables (their text is kept as paragraphs), footnotes and endnotes, comments, tracked changes (the accepted text is kept), fonts, colours and sizes. A line break inside a paragraph becomes a paragraph break.
- A file larger than 50 MB is refused with a message.

**Splitting rules**, applied in this order to the document's blocks:

1. **Chapters.** A new chapter starts at: a heading of the highest heading level that occurs in the document; a paragraph that follows a page break; a short paragraph (at most 60 characters) matching "Chapter" or "Part" followed by a number, a Roman numeral or a number word, in any case. The chapter's title is that heading or line; a chapter that starts at a page break without one is titled "Chapter n". Text before the first chapter becomes a chapter titled with the file's name.
2. **Scenes.** Inside a chapter, a new scene starts at a paragraph consisting only of `#`, `***`, `* * *`, `---` or `###`, or at a centred paragraph of up to five characters with no letters. The line itself is dropped.
3. If no chapter boundary is found, the result is scenes at the top level with no folders.
4. Lower-level headings stay in the text as headings. Empty paragraphs are dropped.

## Contracts provided

`src/features/import/`

- `ImportEntry.tsx` replaces the stub on the library screen; this package also adds the project menu item.
- `read.ts`: turns a file into blocks.
  ```ts
  export interface ImportBlock {
    kind: 'paragraph' | 'heading' | 'blockquote' | 'pagebreak'
    level?: 1 | 2 | 3 | 4 | 5 | 6
    centred?: boolean
    runs: { text: string; em?: boolean; strong?: boolean; underline?: boolean; strike?: boolean }[]
  }
  export function readFile(file: File): Promise<{ blocks: ImportBlock[]; warnings: ImportWarning[] }>
  ```
  - DOCX: `mammoth` converts to HTML, with a style map that turns page breaks into a marker element.
  - Markdown: `marked` converts to HTML.
  - Both HTML strings are parsed with `DOMParser` into a separate, inert document and walked with an allow-list of elements (`p`, `h1` to `h6`, `blockquote`, `em`, `i`, `strong`, `b`, `u`, `s`, `del`, `br`, and the page-break marker). Anything else contributes only its text. The HTML is never inserted into the page. This is the sanitising step the plan requires for `mammoth` output.
  - Plain text: paragraphs are separated by empty lines; if the file has no empty lines, every line is a paragraph. Encoding is UTF-8, or UTF-16 when the file starts with a byte-order mark.
  - `mammoth` and `marked` are imported only here and load on demand.
- `split.ts`: pure and unit-tested.
  ```ts
  export interface SplitOptions { sceneBreaks: 'split' | 'keep'; removed: ReadonlySet<number> }   // indices of boundaries the writer removed
  export interface Outline { chapters: { title: string; scenes: { title: string; blocks: ImportBlock[] }[] }[]; flat: boolean }
  export function split(blocks: ImportBlock[], fileName: string, options: SplitOptions): Outline
  ```
- `create.ts`: turns an `Outline` into `NewNode[]` (folders and scenes with order keys from `keysBetween` and states from `stateFromDoc`) and calls `ProjectStore.importNodes`, or `openProject` with `create` followed by `importNodes` for a new project. The empty scene a new project starts with is removed.

## Contracts consumed

- Package 04: `openProject`, `ProjectStore.importNodes`, `purge`, the library screen's entry place.
- Package 03: `createNodes` in one transaction (through 04).
- Package 01: the `prose` schema, `stateFromDoc`, `keysBetween`, `statsOf`.
- Package 00: `Dialog`.

## Data model changes

None. Imported text carries no provenance mark: it is `typed` (`architecture.md` section 4.3, rule 5).

## Acceptance criteria

1. Unit: a document with three "Heading 1" chapters, each with two `***` lines, splits into three chapters of three scenes; the `***` lines are not in any scene.
2. Unit: with `sceneBreaks: 'keep'`, the same document gives three chapters of one scene each, and each scene contains two scene-break nodes.
3. Unit: "Chapter Twelve", "CHAPTER 3", "Part IV" and "chapter 7: The Road" start chapters; "Chapter and verse were quoted at length in the report that followed" does not.
4. Unit: a document with no headings, page breaks or chapter lines and four `#` lines gives five top-level scenes and no folder.
5. Unit: removing a boundary merges the two items and leaves all text in order.
6. Unit: the HTML `<p>Hi<script>alert(1)</script><img src=x onerror=alert(2)> <a href="javascript:alert(3)">there</a></p>` yields one paragraph with the text "Hi there" and one warning for the image; no script runs. (The test asserts a global flag stays unset.)
7. Browser, both engines: importing a DOCX fixture with italic, bold, a block quote, a page break and a footnote produces a project whose text and styles match, with one warning for the footnote.
8. Importing a Markdown file with `#` and `##` headings makes chapters from `#` and keeps `##` as headings in the text.
9. Importing a plain-text file with Windows line endings and no empty lines makes one paragraph per line.
10. Importing a 300,000-word DOCX fixture produces a project whose total plain text equals the source text.
11. "Add to project" appends after the last existing top-level node and changes nothing else.
12. Cancelling the preview creates nothing.
13. `mammoth` and `marked` are not requested until an import starts.
14. No axe violations in the preview.

## Performance budgets

`docs/PLAN.md` has no budget for import; these are new thresholds.

| Measure | Threshold |
|---|---|
| A 300,000-word DOCX: from choosing the file to the preview shown | at most 20 s in Chromium at four times CPU slowdown; record unthrottled times in both engines |
| From "Create project" to the project open with a caret | at most 5 s (Spike B: building and storing 600 documents took 1.1 to 1.8 s) |
| Recomputing the preview after removing a boundary | at most 200 ms |

Reading and converting run on the main thread, because the conversion needs `DOMParser`; the dialog shows progress and no typing is possible during an import. If the first threshold fails on a phone, moving `mammoth` to a worker and passing the HTML back is the remedy.

## Accessibility and mobile

The preview is a nested list; each boundary control is a button labelled with what it merges ("Merge 'Chapter 4' into 'Chapter 3'"). Warnings are a list, not colour alone. The preview is usable at 320 CSS px width.

## Out of scope

Scrivener, RTF, ODT, EPUB, HTML, Fountain and Final Draft files. Importing images. Footnotes. Detecting chapters by font size. Importing into the middle of a project. Undoing an import (the imported folders can be trashed).

## Dependencies

Packages 01, 03 and 04.
