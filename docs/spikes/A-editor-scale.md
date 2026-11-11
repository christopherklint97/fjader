# Spike A: editing at scale

## Question

Can ProseMirror edit a 300,000-word prose project within the performance budgets on a mid-range phone, and what is the least windowing needed to get there?

Windowing means keeping only the scenes near the screen mounted as live editors, and showing placeholders of the right height for the rest.

## Why it is risky

- ProseMirror has no viewport rendering, and its maintainer treats that as out of scope (`docs/research/editor-storage-tech.md`, §1).
- Reports conflict: one user saw Chrome lag at about 3,000 words, attributed to DOM node count and spellcheck; another found whole novels responsive on phones in production builds, but slow in Firefox on macOS (§1).
- Every engine that tried virtualisation lists the same problems: browser find sees only mounted text, large selections and copy must go through the model, screen readers see only mounted text, and mobile input methods are unproven (§2).
- iOS has known keyboard bugs: no `interactive-widget` support, and `visualViewport` updating late around the keyboard animation (§7).

## Constraints

- ProseMirror directly, React 19, TypeScript, Vite. No Tiptap, no collaboration library, no storage: the project is generated in memory from `spikes/shared/`.
- Prose profile only: paragraph, heading, scene break, block quote, italic and bold.
- Dependencies must be compatible with AGPL-3.0.
- Code lives in `spikes/A/` and is thrown away.

## What to build

One page with a switch between three variants over the same project, a quick-open box that jumps to any scene, an in-app find box, and an on-screen readout of the measurements.

1. **Single editor.** The whole project in one ProseMirror instance. This is the baseline; if it passes, nothing else is needed.
2. **Single editor with skipped rendering.** As 1, with each chapter wrapped in a node styled `content-visibility: auto` and a size hint. Apply it per chapter, not per paragraph; per-element use can be slower in Safari (§2).
3. **Per-scene editors, windowed.** One ProseMirror instance per scene. Only scenes within about two screens of the viewport are mounted; the rest are placeholders with remembered heights. Never unmount the scene that holds the selection or an active text composition.

For variant 3, also build the minimum needed to judge its cost:

- Arrow keys and Backspace cross scene boundaries.
- A selection can start in one mounted scene and end in another; copy returns the correct text from the model.
- Select-all and copy cover the whole project through the model.
- In-app find searches the model, shows a match count, and jumps to matches in unmounted scenes.

## What to measure

Automated, with Playwright in Chromium and WebKit, production build, CPU throttled four times as a rough stand-in for a phone:

- Time from navigation to an editable cursor at a saved position in the middle of the project.
- Keystroke latency while typing 500 characters in the middle of a 500-word scene and in the 10,000-word scene: 95th and 99th percentile. Use the Event Timing API where the browser has it, otherwise timestamps from the input event to the next frame.
- Jump time to the first, a middle and the last scene.
- Scroll position shift when scenes mount and unmount during a slow scroll and a fast fling.
- DOM node count and JavaScript heap.
- In-app find: time to a match count for a common word.

Manual, on a real iPhone (installed to the Home Screen) and a real Android phone (Chrome), for each variant:

- [ ] Type a paragraph mid-project. Any visible lag or dropped characters?
- [ ] Autocorrect, dictation and swipe typing work. On Android, compose text with a non-Latin keyboard (for example Japanese) and confirm composition is not broken.
- [ ] The caret stays visible above the keyboard when it opens, and the page does not jump.
- [ ] A toolbar pinned above the keyboard stays there while scrolling and typing.
- [ ] Fling to the end and back. Any blank areas longer than a blink? Does the position jump?
- [ ] Jump to the last scene from quick open and start typing at once.
- [ ] Long-press to select, drag the handles across a scene boundary, copy, paste elsewhere.
- [ ] Leave the app for a minute, return. Is the position kept?
- [ ] Note the on-screen readout numbers.

## Pass thresholds

From `docs/PLAN.md`, section 6, on the real phones:

- Editable cursor in at most 1.5 s.
- Keystroke latency: 95th percentile at most 32 ms, 99th at most 100 ms, including in the 10,000-word scene.
- Jump to any scene in at most 200 ms.
- Scroll position shift of at most 1 px, and no blank area lasting more than 100 ms in a fling.
- JavaScript heap at most 150 MB.
- Every manual item works, or the failure is recorded with its cause.

A variant passes only if it passes on both phones. The recommendation is the simplest passing variant.

## Deliverable

- The demo in `spikes/A/`, with one command to build and one to serve.
- `docs/spikes/results/A.md`: a table of the numbers per variant, browser and device; the manual checklist results; what failed and why; the dependency list with licences; and one recommendation, including what variant 3's cross-scene work would cost if it is the choice.

## Out of scope

Persistence, sync, the screenplay profile, pagination, snapshots, comments, AI, accessibility beyond noting what a screen reader can reach in each variant, and visual design.
