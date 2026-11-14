# Package 02: Offline shell and updates

## Goal

The app installs to a home screen, starts with no network, and moves from one build to the next without ever running a page from one build with files from another. The design is `architecture.md` section 11; this spec adds the module boundaries and the tests.

## User-visible behaviour

- The app can be installed (Add to Home Screen on iOS, the install prompt elsewhere) and opens in its own window with the Fjäder name and icon.
- After the first visit, the app starts and works with no network connection.
- When a new version is ready, a small notice appears: "A new version is ready" with the button "Update now". The app also updates by itself the next time it is hidden or started. An update never interrupts typing: it happens on the button, when the app is hidden, or when no project is open.
- After an update the app reopens the same project at the same position.

## Contracts provided

**Build.** `scripts/build-sw.ts` runs after `vite build`. It lists every file in `dist/`, bundles `src/sw/sw.ts` into `dist/sw.js` as one file, and defines two constants in it: `__BUILD_ID__` and `__PRECACHE__` (the list of relative URLs, with `index.html` first).

**`src/sw/install.ts`**: pure functions, unit-tested without a browser.

```ts
export function cacheNameOf(buildId: string): string                       // 'fjader-<buildId>'
export function requestFor(url: string, buildId: string): { url: string; cache: RequestCache }
export function accept(url: string, res: { status: number; contentType: string | null; body?: string }, buildId: string): boolean
export function staleCaches(names: string[], buildId: string): string[]    // other 'fjader-*' caches
export function route(url: URL, mode: RequestMode, scope: string, precache: readonly string[]): 'shell' | 'precached' | 'network'
```

**`src/sw/sw.ts`**: the service worker. It handles `install`, `activate`, `fetch`, and two messages: `{ type: 'build-id' }`, answered with its build id, and `{ type: 'activate' }`, on which a waiting worker calls `skipWaiting()`.

**`src/sw/page.ts`**: the page side.

```ts
export function startUpdates(opts: { projectOpen: () => boolean }): void
export function updateReady(): boolean                         // a verified build is waiting; with subscribe()
export function subscribeUpdates(listener: () => void): () => void
export function applyUpdate(): Promise<never>                  // run beforeReload callbacks, activate, reload
```

`startUpdates` registers `sw.js` with `updateViaCache: 'none'`, checks for updates as section 11 says, applies a waiting update when the page is hidden or no project is open, and performs the build id check against the controlling worker.

**`src/app/UpdateNotice.tsx`**: the notice, shown while `updateReady()` is true.

**Static files:** `public/manifest.webmanifest` (name, short name, `display: standalone`, relative `start_url` and `scope`, theme and background colours, icons at 192 and 512 px and a maskable icon), an Apple touch icon, `public/404.html`, `public/_headers` with the table from section 11, and the inline recovery script in `index.html`.

## Contracts consumed

- Package 00: `BUILD_ID`, `beforeReload` and `reloadApp` from `platform/lifecycle.ts`, `scripts/serve.ts`.
- Storage registers its flush with `beforeReload` in package 04; this package only calls `reloadApp`.

## Data model changes

None. The service worker uses Cache Storage only, in caches named `fjader-<buildId>`.

## Acceptance criteria

The browser tests use a test server that can switch between two builds, A and B, and can be told to misbehave for one path. "Consistent" means: every script and stylesheet a document loads is in the precache list of the build named in that document's `fjader-build` meta tag. Every test below asserts consistency for every document loaded during the test.

1. After one online visit to build A, the app loads with the network disabled.
2. With a page on build A open, visible, and a project open, switching the server to B results in: the notice appears; the page loads no file of B; no reload happens for 30 seconds.
3. From the state in 2, hiding the page (or pressing "Update now") reloads it on build B, and afterwards only the cache `fjader-<B>` exists.
4. With the app closed, switching the server to B and opening the app twice results in build B on the second opening at the latest, and never a mixed document.
5. If the server answers 404 for one file of B, B's worker never activates, the page stays on A, and no cache for B exists. When the server is repaired, the next update check installs B.
6. If the server answers the request for B's `index.html` with A's `index.html`, B's install fails as in 5.
7. If the server answers a missing asset with the app shell and status 200, the install fails as in 5.
8. With two windows on build A, applying the update in one reloads the other onto B within 5 seconds.
9. A page loaded from the network on build A whose worker installs build B (server switched between the two requests) reloads onto B before any project is opened.
10. When a script named by the document fails to load, the page reloads once and not a second time within 30 seconds.
11. `applyUpdate` awaits every `beforeReload` callback before the reload.
12. Lighthouse's installability checks pass for the manifest (run locally; the result is recorded in the pull request).
13. Unit tests cover `accept`, `route` and `staleCaches`, including an HTML response for a `.js` URL and an `index.html` without the build id.

The tests run in Chromium. If Playwright's WebKit build runs service workers, they run there too; if it does not, the pull request says so and the update flow joins the real-device checks in `README.md`.

## Performance budgets

- Warm start contributes to "open project to an editable cursor, warm, at most 500 ms on a phone": serving the shell from the cache must add no network round trip. The test asserts zero network requests on an offline warm start.
- The first install downloads the whole build once. The pull request records the total precache size; the SQLite WASM file is about 408 KB compressed (Spike B). Import and export libraries are loaded on demand but are still precached, so that they work offline.

## Accessibility and mobile

The notice is a live region, is reachable by keyboard, does not cover the text being edited, and does not take focus. Icons include a maskable variant; the theme colour follows the colour scheme.

## Out of scope

Push notifications, background sync, sharing targets, and the choice of host (package 17).

## Dependencies

Package 00.
