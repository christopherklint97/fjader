# Package 09: Find and search

## Goal

The writer can find any word, phrase or pattern anywhere in the manuscript, including in scenes that are not on screen, and step through or list the matches. The design is `architecture.md` section 9: a scan of stored plain text, no index, regular expressions in a disposable worker.

## User-visible behaviour

- **Find.** The find shortcut opens a bar at the top of the text (the browser's own find does not open). As the writer types, all matches in view are highlighted and the bar shows "3 of 128". Enter or the next shortcut goes to the next match after the caret, in manuscript order, wrapping at the end; Shift+Enter or the previous shortcut goes back. Going to a match scrolls it into view and marks it as the current one. Escape closes the bar, leaves the current match selected, and returns focus to the text.
- **Options**, as toggles in the bar: match case, whole word, regular expression.
- **Search panel.** The search shortcut opens a panel listing matches across the manuscript, grouped by scene in manuscript order, each group headed by the folder path, the scene title and its match count, each match shown with the text around it. Choosing a match goes to it and selects it. The panel shows the first 200 matches and the total; a group with more matches than shown has "Show all in this scene".
- **Staying current.** If the text changes while the bar or panel is open, results refresh shortly after typing stops.
- **Problems.** An invalid regular expression shows the engine's message under the field. A pattern that takes more than two seconds is stopped and the bar says "This pattern took too long".
- Text in the Trash is not searched.

## Contracts provided

**Storage handlers**, replacing the stubs in `src/storage/worker/handlers/search.ts`:

- `search(q, limit)`: compacts scenes with a non-empty log, then scans `doc_text` for scenes in manuscript order and returns a `SearchResult` (types in package 01). `before` and `after` in each hit are up to 40 characters of context within the same line.
- `searchScene(q, sceneId)`: every match in one scene as `TextRange[]`.
- `allText()`: every live scene's plain text in manuscript order, after the same compaction.
- For `mode: 'regex'` the first two reject with `invalid`; regular expressions never run in the storage worker.

**`src/model/search.ts`**: one pure module used by the storage worker and by the regular-expression worker, so that both produce identical ranges.

```ts
export function compile(q: SearchQuery): RegExp         // throws on an invalid pattern
export function matchAll(re: RegExp, body: string): TextRange[]   // skips zero-length matches
```

- `mode: 'text'` escapes the text and matches it literally. Whole word requires that the characters before and after the match are not letters, digits or underscore (Unicode-aware lookbehind and lookahead).
- Flags: `g` and `u` always, `i` unless `caseSensitive`, `m` for regular expressions so that `^` and `$` match at paragraph boundaries.

**`src/features/search/regex-worker.ts`** and `runRegexSearch(storage, q, limit): Promise<SearchResult>`: fetches `allText()`, starts a worker, posts the texts and the query, and terminates the worker when it answers or after two seconds, rejecting with code `invalid` and the message for "took too long".

**Components:** `features/find/FindBar.tsx` and `features/search/SearchPanel.tsx` replace the stubs. Highlights use `EditorPane.setDecorations('find', …)` for all matches in scenes the pane reports in view (from `viewport` events, extended to the mounted window) and `setDecorations('find-current', …)` for the current one. Going to a match calls `navigator.goTo(position, { select })`.

Registers the shortcuts `find.open`, `find.next`, `find.previous`, `search.open`.

## Contracts consumed

- Package 03: the worker's handler table, compaction.
- Package 05: `setDecorations`, `viewport` events, `selection()` for the starting point.
- Package 04: `Navigator`, `ProjectStore` (titles and paths for the panel).
- Package 00: `openPanel` from `ui/panels.ts`, shortcuts.
- Package 01: `SearchQuery`, `SearchResult`, `posAtOffset`.

## Data model changes

None.

## Acceptance criteria

1. On the fixture, finding a planted word that occurs in 12 known scenes reports exactly the planted count and positions, in both engines.
2. Finding "the" on the fixture reports the same total as an independent count over the fixture's source text.
3. Next from the last match wraps to the first; Previous from the first wraps to the last.
4. Going to a match in a scene that has never been mounted scrolls to it and selects exactly the matched text.
5. Typing a new word into a scene and searching for it within one second finds it (the compaction-before-search rule).
6. Whole word: "art" does not match inside "party" or "artist" and does match "art," and "Art" when match case is off.
7. Match case on: "The" does not match "the".
8. A phrase containing spaces matches only where the words are adjacent in one paragraph.
9. Regular expression `\bcolou?r\b` matches both spellings; `^She` matches only at the start of a paragraph.
10. Regular expression `(a+)+$` against a planted line of 40 "a" characters followed by "b" is stopped within 2.5 seconds, the message appears, and a keystroke typed in the editor during the search becomes durable within one second.
11. An invalid pattern shows a message and does not clear the previous results.
12. The search panel groups by scene in manuscript order, shows at most 200 matches, and "Show all in this scene" lists the rest.
13. A trashed scene's text is not found; restoring the scene makes it findable.
14. With the find bar open, the browser's find does not open on the shortcut.
15. No axe violations with the bar open and with the panel open.

## Performance budgets

On the fixture, both engines, added to `tests/perf/`. The storage worker is not affected by CPU throttling; the time includes the round trip and painting the count.

| Budget | Threshold | How measured | Spike B, for comparison |
|---|---|---|---|
| Project-wide search for a word or phrase, first results shown | at most 150 ms (phone), 80 ms (desktop) | from the query change (after the debounce) to the frame showing the count; a rare word, a word in every scene, and a phrase | scan 7 to 25 ms |
| Same, with one scene holding 200 logged updates | at most 150 ms | as above, after typing 200 changes into a scene | compaction about 14 ms |
| Project-wide regular-expression search | at most 1.5 s (phone), 500 ms (desktop) | from the query change to the frame showing the count, including starting the worker and copying the text | scan 8 to 18 ms |
| Stepping to the next match in an unmounted scene | within the jump budget, 200 ms | Enter to the frame showing the selected match | |

## Accessibility and mobile

- The bar is a labelled search landmark; the count is a polite live region; the option toggles have `aria-pressed`.
- In the panel, results are a list; each result is a button whose label includes the scene title and the context.
- On narrow screens the bar sits at the top of the visible area and the panel is a bottom sheet; buttons for next and previous are provided, since there is no Enter with Shift on a phone keyboard.
- Safari's "Find on Page" from the share sheet still searches only mounted text. This is a known limit and is stated in the app's help text for find.

## Out of scope

Replace and replace all (an open decision in `README.md`; `SceneStore.apply` is the write path it would use). Searching titles and synopses (quick open covers titles). Ranking by relevance. Matching that ignores accents. A full-text index.

## Dependencies

Packages 03 and 05.
