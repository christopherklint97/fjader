# Package 08: Toolbar, mobile keyboard, focus mode

## Goal

Formatting and undo are reachable without a hardware keyboard, the toolbar stays usable while the on-screen keyboard is open, and the writer can hide everything but the text.

## User-visible behaviour

- **Toolbar.** Buttons for bold, italic, underline and strikethrough; a block menu with Paragraph, Heading 1 to 3 and Block quote; a button that inserts a scene break; Undo and Redo. A button shows as pressed when the selection has that style. Buttons are disabled when no scene has focus, and Undo and Redo when there is nothing to undo or redo.
- **Placement.** On wide screens the toolbar is a row above the text. Under 720 CSS px it is a row fixed to the bottom of the visible area: directly above the on-screen keyboard when the keyboard is open, at the bottom of the screen otherwise. It scrolls sideways if the buttons do not fit.
- **Keyboard and caret.** When the on-screen keyboard opens or the caret moves below the visible area, the text scrolls so that the caret's line is visible above the toolbar. Tapping a toolbar button does not close the keyboard or move the caret.
- **Focus mode.** One command hides the top bar, the sidebar, the side panel and, on wide screens, the toolbar, leaving the text column on a plain background. Escape, the same shortcut, or a small button in the corner leaves focus mode. On narrow screens the toolbar above the keyboard stays. Whether focus mode was on is remembered on the device.

## Contracts provided

- `src/features/toolbar/Toolbar.tsx` replaces the stub.
- `src/features/focus/focus.ts`: `isFocusMode()`, `setFocusMode(on: boolean)`, `subscribeFocusMode(listener)`. `ProjectScreen` hides regions when it is on; this package makes that change in `ProjectScreen.tsx`.
- `src/platform/keyboard.ts` (created by package 05 with `keyboardInset()`) gains what the toolbar needs:
  ```ts
  export function keyboardInset(): number                         // CSS px covered at the bottom of the layout viewport
  export function subscribeKeyboard(listener: () => void): () => void
  export function visibleBottom(): number                         // y of the bottom of the visible area, in layout viewport coordinates
  ```
  It is the only file that reads `visualViewport`.
- Registers the shortcut `view.focus`.

## Contracts consumed

- Package 05: `useActivePane()`, `EditorPane.run`, `formatState`, `subscribe`, `focus`.
- Package 04: `UndoCoordinator` (`canUndo`, `canRedo`, `undo`, `redo`, `subscribe`).
- Package 00: shortcuts, `isNarrow`.

## Data model changes

None. `localStorage` key `fjader.focusMode`.

## Acceptance criteria

1. Each toolbar button applies its command to the selection and shows the pressed state when the caret is inside styled text. (Both engines.)
2. Toolbar buttons do not take focus from the editor: after pressing Bold, typing continues at the caret.
3. Undo and Redo buttons do what the shortcuts do and are disabled at the ends of the history.
4. With the visual viewport shrunk to simulate a 300 px keyboard on a 390 by 844 viewport, the toolbar's bottom edge is at the bottom of the visual viewport and the caret's line is fully visible above the toolbar.
5. Focus mode hides the listed regions and restores them; the caret and scroll position do not change when toggling.
6. Focus mode persists across a reload.
7. No axe violations with the toolbar visible, in normal and focus mode.

## Performance budgets

- Keystroke latency with the toolbar mounted stays within the package 05 thresholds: the toolbar re-renders on `format` events only when the state changed.
- Repositioning on a `visualViewport` change does not cause a layout of the text: the toolbar moves with a transform.

## Accessibility and mobile

- The toolbar is `role="toolbar"` with one tab stop and arrow-key movement between buttons; each button has a text label and `aria-pressed` where it toggles.
- Buttons are at least 44 by 44 CSS px on touch devices.
- The corner button that leaves focus mode is always reachable by keyboard and has a label.
- **Not verified on a device.** Spike A could not test keyboard behaviour on a phone, and the research lists WebKit bugs in this area (late `visualViewport` updates, no `interactive-widget`). Criterion 4 simulates the keyboard. The real check is in `README.md`; fixes stay inside `platform/keyboard.ts` and the toolbar's positioning.

## Out of scope

Typewriter scrolling, dimming of other paragraphs, themes, font or text-size settings, timed writing sprints.

## Dependencies

Package 05.
