# Package 12: Word targets

## Goal

The writer can set a target for the manuscript and a target for each day, and see progress without leaving the text.

## User-visible behaviour

- **Indicator.** The top bar shows the manuscript's word count. With a manuscript target set it shows "42,300 / 90,000" and a thin progress bar. With a daily target set it also shows today's words, "640 / 1,000 today".
- **Today's words** are the manuscript's total now minus its total when the day's first change was made, by the device's local date. Deleting more than was written shows a negative number.
- **Selection.** While text is selected, the indicator shows the number of selected words instead.
- **Setting targets.** Choosing the indicator opens a dialog with two optional numbers: manuscript target and daily target. Clearing a field removes that target.
- Reaching a target changes the bar's appearance and is announced once; there is no other interruption.
- In focus mode the indicator is hidden with the rest of the top bar.

## Contracts provided

- `src/features/targets/TargetsIndicator.tsx` replaces the stub.
- **Storage handler**, replacing the stub in `handlers/words.ts`: `wordsToday()` returns today's `daily_words` row; if the day has no row yet, it returns `{ day, startWords: total, endWords: total }` with the current stored total and writes nothing.
- `src/features/targets/today.ts`: `todayWords(liveTotal: number, row: { startWords: number }): number`, and the logic that asks storage again when the local date changes while the app is open.

## Contracts consumed

- Package 03: the `daily_words` rows written at compaction, the handler table.
- Package 04: `ProjectStore.totalWords()` (live), `meta()` and `setMeta()` for `targetWords` and `targetDaily`.
- Package 05: `useActivePane()` and `selection` events for the selected word count; text of a selection is read from the stores, not the DOM.
- Package 00: `Dialog`.

## Data model changes

None in the schema; uses `daily_words` and the `target_words` and `target_daily` keys of `meta`.

## Acceptance criteria

1. Setting a manuscript target of 1,000 on a project with 400 words shows "400 / 1,000" and a bar at 40 percent; the target is still set after reopening.
2. Typing ten words raises the manuscript count and today's count by ten within one second.
3. Deleting 20 words on a day that started at 400 shows "-20 today".
4. Unit: with a stored row for yesterday only, the first compaction today creates today's row with `start_words` equal to yesterday's `end_words`. (Checks the package 03 behaviour this feature relies on.)
5. Unit: when the local date changes while the app is open, today's count restarts from zero at the next change.
6. Selecting a 25-word passage shows "25 words selected"; a selection across three scenes shows the total.
7. Clearing both fields removes the progress bar and the "today" text.
8. No axe violations with the indicator and with the dialog open.

## Performance budgets

- Keystroke latency with the indicator mounted stays within the package 05 thresholds. The indicator updates at most four times a second and does not read any document on a keystroke; it reads `ProjectStore.totalWords()`.
- Counting the words of a selection spanning the whole fixture takes at most 100 ms at four times CPU slowdown and runs only when the selection has been stable for 200 ms.

## Accessibility and mobile

- The progress bar is a `progressbar` with a text value ("42,300 of 90,000 words"). Reaching a target is announced through a polite live region once per day for the daily target and once for the manuscript target.
- On narrow screens the indicator shortens to the count and the bar; the dialog shows the rest.

## Out of scope

Deadlines and words-per-day calculations, charts and history, streaks, per-scene and per-chapter targets, timed sprints, session targets separate from the day.

## Dependencies

Packages 03 and 04. Package 05 for the selected word count.
