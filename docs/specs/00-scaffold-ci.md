# Package 00: App scaffold and CI

## Goal

A repository in which every later package can be built, tested and reviewed: the project layout, the tool chain, the empty app shell, the test harnesses, and one CI workflow.

## User-visible behaviour

Opening the built app shows a page titled "Fjäder" with an empty library screen. Nothing else.

## Contracts provided

Everything in `architecture.md` section 3 (layout, import rule, tools). In addition:

**Scripts** in `package.json`, each usable locally and in CI:

| Script | Does |
|---|---|
| `dev` | Vite development server |
| `build` | production build into `dist/`, then `scripts/build-sw.ts` (a no-op that prints "no service worker yet" until package 02) |
| `preview` | serves `dist/` with `scripts/serve.ts` |
| `lint` | Biome lint and format check |
| `check:imports` | `scripts/check-imports.ts`, the import rule |
| `typecheck` | `tsc --noEmit` |
| `test` | `bun test` over `src/` |
| `test:e2e` | Playwright over `tests/e2e/`, Chromium and WebKit, against `dist/` |
| `test:perf` | Playwright over `tests/perf/` |

`scripts/serve.ts` is the static server for tests and previews. It serves `dist/`, answers a missing file with status 404, sends `application/wasm` for `.wasm`, and applies the rules in `public/_headers`.

**Build id.** `vite.config.ts` computes the build id (`architecture.md` section 11) and defines the constant `__BUILD_ID__`. `src/platform/build.ts` exports it as `BUILD_ID`. `index.html` carries `<meta name="fjader-build">`. The build uses `base: './'` so that the app runs from any path.

**App shell.** `src/app/App.tsx`: error boundary, the fragment router (`#/` and `#/p/<projectId>`), and the two screens as placeholders `LibraryScreen` and `ProjectScreen`, which package 04 fills.

**Platform functions**, in `src/platform/`, where every later directory may import them:

- `lifecycle.ts`:
  ```ts
  export function onHidden(fn: () => void | Promise<void>): () => void   // visibilitychange to hidden, and pagehide
  export function beforeReload(fn: () => Promise<void>): () => void      // awaited by reloadApp
  export function reloadApp(): Promise<never>                            // runs beforeReload callbacks (500 ms limit each), then reloads
  ```
- `shortcuts.ts`: the table of every Phase 1 shortcut and one hook.
  ```ts
  export type ShortcutId = keyof typeof shortcuts
  export function useShortcut(id: ShortcutId, handler: () => void, enabled?: boolean): void
  export function shortcutLabel(id: ShortcutId): string    // "⌘K" or "Ctrl+K", for menus and tooltips
  ```
  `Mod` is Command on Apple platforms and Control elsewhere. Only the ids are a contract; default keys may change after usability testing.

  | Id | Default keys | Owner |
  |---|---|---|
  | `app.save` | Mod+S | 04 |
  | `edit.undo`, `edit.redo` | Mod+Z; Mod+Shift+Z and Ctrl+Y | 05 |
  | `edit.selectAll` | Mod+A | 07 |
  | `format.bold`, `format.italic`, `format.underline`, `format.strike` | Mod+B, Mod+I, Mod+U, Mod+Shift+X | 05 |
  | `find.open`, `find.next`, `find.previous` | Mod+F, Mod+G, Mod+Shift+G | 09 |
  | `search.open` | Mod+Shift+F | 09 |
  | `nav.quickOpen` | Mod+K | 10 |
  | `nav.back`, `nav.forward` | Ctrl+Alt+Left, Ctrl+Alt+Right | 10 |
  | `bookmark.toggle` | Mod+D | 10 |
  | `snapshot.create` | Mod+Shift+S | 11 |
  | `scene.new`, `scene.split` | Mod+Alt+N, Mod+Alt+S | 06 |
  | `view.sidebar` | Mod+Backslash | 06 |
  | `view.focus` | Mod+. | 08 |
  | `view.split` | Mod+Alt+Backslash | 16 |

**Shared pieces:**

- `src/i18n/`: `t(key, params?)` over a typed catalogue `en.ts`. A missing key is a type error.
- `src/ui/tokens.css`: colour, spacing and type tokens as custom properties, light and dark through `prefers-color-scheme`. `src/ui/Dialog.tsx` (native `<dialog>`), `Sheet.tsx` (bottom sheet built on `<dialog>`), `Toast.tsx` (a live region), and `panels.ts` with `openPanel(name: 'search' | 'snapshots' | null)`, `currentPanel()` and a subscription, so that the side panel shows one feature at a time.
- `src/platform/env.ts`: `storageAvailable(): Promise<boolean>` (OPFS present and usable), `isTouch()`, `isApple()`, `isNarrow()` (under 720 CSS px, with a subscription).
- `src/platform/save-file.ts`: `saveFile(name: string, bytes: Uint8Array, mime: string): Promise<void>`. It uses `navigator.share` with a file when `navigator.canShare` accepts it on a touch device, and a download link otherwise. Backup and export use it.

**Test harness:**

- `playwright.config.ts`: projects `chromium` and `webkit`, a phone viewport of 390 by 844 CSS px at device pixel ratio 2 and a desktop viewport of 1280 by 800, `scripts/serve.ts` as the web server.
- `tests/perf/budgets.ts`: the thresholds of `docs/PLAN.md` section 6 as one typed object with a `phone` and a `desktop` value for each.
- `tests/perf/measure.ts`: helpers shared by all budget tests: `median(runs)`, `percentile(samples, p)`, `withCpuThrottle(page, rate)` (Chromium only), `report(name, value, budget)` which records to a JSON file and fails when over budget after one retry.
- `tests/e2e/axe.ts`: `expectNoA11yViolations(page)`.

**CI**: `.github/workflows/ci.yml`, the only workflow.

- Triggers: `push` to `main` and `pull_request`. A pull request does not also trigger a push run.
- Concurrency: one group per branch with `cancel-in-progress` for anything but `main`; on `main`, one group per commit.
- `permissions: contents: read`.
- Job `check` (arm64 runner, 10-minute limit): checkout with depth 2; a plan step running `scripts/ci-plan.sh`, which sets `code=false` when every changed path is documentation (`docs/**`, top-level `*.md`, `LICENSE`, `spikes/**`) and `code=true` otherwise or when in doubt; then, only when `code` is true: set up Bun at the version in `package.json`, restore the Bun package cache keyed on `bun.lock`, `bun install --frozen-lockfile`, save the cache on `main` only, then `lint`, `check:imports`, `typecheck`, `test`. The job reports success for a docs-only change.
- Job `browser` (`needs: check`, skipped unless `code` is true, 20-minute limit): runs in the container `mcr.microsoft.com/playwright:v<version>-noble`, where `<version>` equals the Playwright version in `bun.lock`; `scripts/check-playwright-version.ts` fails the `check` job when they differ. Steps: install, `build`, `test:e2e`, `test:perf`, upload `tests/perf/results/*.json`, and on `main` upload `dist/` as an artifact for package 17.
- No visual regression suite in Phase 1. If one is added it runs weekly on `main`, as `docs/PLAN.md` section 12 says.

After this package merges, the `main` ruleset requires the checks `check` and `browser`.

## Contracts consumed

None.

## Data model changes

None.

## Acceptance criteria

1. `bun install --frozen-lockfile && bun run build` succeeds from a clean checkout and writes `dist/index.html` containing the build id.
2. `bun run lint`, `check:imports`, `typecheck`, `test`, `test:e2e` and `test:perf` all pass. Each has at least one real test: a unit test of `t()`, an end-to-end test that the library screen renders in both engines with no axe violations, and a performance test that records the time from navigation to first render.
3. `check:imports` fails when a file in `src/model/` imports from `src/app/`, and when one feature imports another; both cases are covered by a test of the script.
4. A pull request that changes only `docs/` finishes with `check` successful, `browser` skipped, and no dependency install.
5. A second push to a pull request cancels the first run.
6. A pull request with a lint error fails `check` and never starts `browser`.
7. `scripts/serve.ts` answers `/assets/missing.js` with 404 and a body that is not the app shell.
8. Changing the Playwright version in `package.json` without changing the container tag fails `check`.
9. `README.md` says how to install, run, test and build.

## Performance budgets

None to prove. This package provides the table and helpers the others use.

## Accessibility and mobile

The shell sets `lang`, a viewport meta tag that allows zoom, and the colour scheme. `Dialog`, `Sheet` and `Toast` meet `architecture.md` section 14: focus moves into a dialog and returns on close, Escape closes, toasts are announced.

## Out of scope

Service worker and manifest (package 02). Deployment (package 17). Any storage or editor code.

## Dependencies

None.
