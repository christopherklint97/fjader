# Package 14: DOCX manuscript export

## Goal

The writer exports the manuscript as a DOCX file in standard manuscript format, ready to send to an editor, agent or magazine. The format is the one in `docs/PLAN.md` section 8 ("Standard manuscript format").

## User-visible behaviour

- "Export manuscript" in the project menu opens a dialog with: byline, contact block (several lines), surname and title keyword for the page header, font (Modern: Times New Roman; Classic: Courier New), and whether to print "END" after the last line. The values are remembered in the project. The title is the project's title.
- "Export" produces `<project title>.docx` and saves it like a backup file (share sheet or download).
- **Layout chosen from the structure:**
  - A project with no folders is a **story**: contact block top-left and word count top-right on the first page, the title and byline a third of the way down, then the text.
  - A project with folders is a **novel**: a separate title page with the same blocks, then each chapter starting on a new page with its title a third of the way down. A folder that contains folders is a part and gets a page of its own with its title.
- **In both:** 12 pt, double-spaced, 1 inch margins, 0.5 inch first-line indent, left-aligned with a ragged right edge; from the second page a right-aligned header "Surname / Keyword / page number"; the word count rounded to the nearest 100; a centred `#` between scenes and for each scene break inside a scene.
- Scene titles and synopses are not exported. Text in the Trash is not exported.
- The dialog shows progress while the file is built and can be cancelled.

## Contracts provided

`src/features/export/`

- `ExportMenuItem.tsx` replaces the stub and renders the dialog.
- `manuscript.ts`: reads the project into a plain structure, independent of DOCX, so that later exporters reuse it.
  ```ts
  export interface ManuscriptPart { title: string; chapters: ManuscriptChapter[] }      // a story has one part with one untitled chapter
  export interface ManuscriptChapter { title: string; scenes: PMNodeJSON[] }
  export function readManuscript(project: Project, onProgress: (done: number, total: number) => void): Promise<{ parts: ManuscriptPart[]; words: number; kind: 'story' | 'novel' }>
  ```
  It reads documents with `storage.openDocs` in groups of 50 scenes and converts them with `model/convert.ts`. Scenes directly inside a part folder, beside chapter folders, form an untitled chapter at that place.
- `docx.worker.ts`: a worker, started for one export, that receives the structure and the `ManuscriptInfo` and returns the file's bytes. The `docx` package is imported only here, so it loads only when exporting.
- `shunn.ts`: the mapping, pure and unit-tested:

  | Model | DOCX |
  |---|---|
  | paragraph | body paragraph: line spacing exactly double, first-line indent 0.5 inch, no space between paragraphs |
  | heading (any level) | paragraph without indent, bold, kept with the next paragraph |
  | block quote | paragraphs indented 0.5 inch on both sides, no first-line indent |
  | scene break, and the boundary between two scenes | centred paragraph containing `#` |
  | `em`, `strong`, `underline`, `strike` | italic, bold, underline, strikethrough runs |
  | `provenance` | ignored |
  | chapter | page break before; empty lines to one third of the page; centred title; one empty line |
  | project language | the language of every run |

## Contracts consumed

- Package 03: `openDocs`.
- Package 04: `useProject`, `ProjectStore` (tree, `meta().manuscript`, `setMeta`).
- Package 01: `ManuscriptInfo`, `model/tree.ts` (`isChapter`), `model/convert.ts`.
- Package 00: `saveFile`, `Dialog`.

## Data model changes

None in the schema; stores the dialog's values in the `manuscript` key of `meta`.

## Acceptance criteria

Unit tests unzip the produced file and inspect `word/document.xml`, `word/styles.xml` and the header part.

1. Page margins are 1440 twentieths of a point on all four sides; the page size is US Letter.
2. Body paragraphs have line spacing 480 with the exact-or-auto rule set to double, a first-line indent of 720, and left alignment.
3. The font is Times New Roman at 24 half-points when Modern is chosen and Courier New when Classic is chosen.
4. The first page has no header; later pages have a right-aligned header with the surname, the keyword and a page number field.
5. A story of 2,449 words prints "about 2,400 words"; 2,450 prints "about 2,500 words".
6. Two scenes in one chapter are separated by a centred `#`; a scene break inside a scene produces the same.
7. A project with folders has a title page, and each chapter's first paragraph has a page break before it; a project without folders has neither.
8. Italic text in the editor is italic in the file and is not underlined.
9. A trashed scene's text is absent from the file.
10. Text with a provenance mark is exported as ordinary text.
11. Browser, both engines: exporting the fixture produces a file whose extracted text equals the manuscript's plain text in order (ignoring the added title, header and `#` lines).
12. Cancelling during the export stops the worker and saves nothing.
13. The `docx` package is not in the initial bundle: the test asserts that no request for its chunk is made until the export starts.
14. Manual, recorded in the pull request: the fixture's export and a short story's export open without a repair prompt in Microsoft Word and LibreOffice Writer, and the first two pages match the layout above.

## Performance budgets

`docs/PLAN.md` has no budget for export; these are new thresholds for this package.

| Measure | Threshold |
|---|---|
| Export the fixture (300,000 words), from "Export" to the bytes handed to `saveFile` | at most 10 s in Chromium at four times CPU slowdown; record the unthrottled time in both engines |
| Main thread during export | no frame longer than 100 ms; the document is built in the worker |
| Initial bundle | unchanged by this package apart from the menu item and dialog |

## Accessibility and mobile

The dialog's fields have labels; progress is a `progressbar` with a text value; cancelling is a button. On a phone the dialog is a full-height sheet and the file is offered through the share sheet.

## Out of scope

Other page sizes, including A4. Custom fonts and styles. Footnotes. Tracked changes and comments. EPUB and print PDF (Phase 4). Exporting part of the manuscript. RTF.

## Dependencies

Packages 01, 03 and 04.
