# Package 17: Deploy

## Goal

Every commit on `main` that passes CI is published as the live app, at one permanent origin, with the cache headers of `architecture.md` section 11.

This package cannot start until the owner has chosen the host and the domain (decision 1 in `README.md`). The spec is written for the recommended choice and says what differs for the others.

## User-visible behaviour

The app is reachable at one HTTPS address. A new version reaches an open app through the update flow of package 02.

## Why the origin matters

Everything a writer stores lives in the browser under the app's **origin** (scheme, host and port). If the app later moves to another origin, the projects do not move with it: each writer would have to export backups from the old address and restore them at the new one. The address must therefore be chosen once, and it should be a domain the project controls, so that the host behind it can change without the origin changing.

Two addresses to avoid as the permanent origin for that reason:

- `<user>.github.io/<repository>/`: the origin is shared with every other site of the same account, and any of them could read the stored projects.
- a host's own subdomain (`*.pages.dev` and the like): the origin belongs to the host.

## Contracts provided

- A `deploy` job in `.github/workflows/ci.yml`: runs on `main` only, `needs: [check, browser]`, downloads the `dist` artifact the `browser` job uploaded (it does not build again), publishes it, then runs `scripts/check-deploy.ts`. It is skipped for docs-only changes. Its concurrency group is the deployment, without cancelling a run in progress.
- `scripts/check-deploy.ts <url>`: fetches the live site and fails unless all of the following hold.
  1. `index.html` contains the build id of the commit being deployed.
  2. A request for `/assets/does-not-exist.js` returns status 404 and a body that is not the app shell.
  3. The `.wasm` file is served as `application/wasm`.
  4. Every file in the build's precache list returns 200.
  5. Where the host supports headers: `index.html` has `Cache-Control: no-store`, `sw.js` has `no-cache`, a file under `/assets/` has `immutable`, and the 404 has `no-store`.
  6. No response carries `Cross-Origin-Opener-Policy` or `Cross-Origin-Embedder-Policy`.
- `docs/hosting.md`: how to host the app anywhere, for people who run their own copy: the three requirements of section 11, the header table, and the warning about origins above.

**For the recommended host, Cloudflare Pages with a custom domain:** the job publishes `dist/` with the host's command-line tool, using an API token stored as a repository secret that is limited to this one project; `public/_headers` (from package 02) sets the headers; `public/404.html` makes missing files return 404.

**If GitHub Pages is chosen instead:** the job uses the Pages artifact and deploy actions with `pages: write` and `id-token: write` permissions on that job only; a custom domain is configured for the repository; check 5 is skipped, because GitHub Pages sets its own cache headers for every file; `public/404.html` serves as the 404 page.

**If a container on the owner's server is chosen instead:** the job builds an image containing `dist/` and a static file server configured with the header table, and pushes it to the container registry; pulling and starting it is done on the server by its own deploy script. The app's availability for first visits and updates then depends on that server.

## Contracts consumed

- Package 00: the workflow, the `dist` artifact, `scripts/serve.ts` as the reference for header behaviour.
- Package 02: `public/_headers`, `public/404.html`, the precache list, the build id.

## Data model changes

None.

## Acceptance criteria

1. A merge to `main` that changes application code results in the live site serving that commit's build id, without a second build in the workflow.
2. `scripts/check-deploy.ts` passes against the live site after each deploy, and the job fails when any check fails. The script's checks are unit-tested against `scripts/serve.ts` with deliberately wrong configurations (a server that returns the shell for missing files, a wrong MIME type for `.wasm`, a stale `index.html`).
3. A docs-only merge deploys nothing.
4. A failed `check` or `browser` job prevents the deploy.
5. With the live site open on build A in a browser, a deploy of build B, followed by hiding and showing the page, loads build B, and no document ever loads files from two builds. Done once by hand on a desktop browser and once on an installed phone app, and recorded in the pull request.
6. Redeploying an earlier commit (a rollback) is possible by running the workflow for that commit. A project already migrated by a newer build is then refused by the older build with the "newer version" message and is not modified (`architecture.md` section 5).
7. The deploy token (or equivalent credential) appears only as a repository secret; it is absent from the workflow file, logs and artifacts.
8. Pull requests from forks cannot deploy: the job runs only for pushes to `main`.

## Performance budgets

- The deploy job takes at most three minutes.
- Contributes to cold open: `scripts/check-deploy.ts` records the transfer size of the initial files (the shell, the entry script and style, the storage worker and the SQLite WASM file) with the host's compression. The total must not exceed 1.2 MB compressed; Spike B measured 408 KB for the WASM file and 122 KB for a worker bundling Yjs.

## Accessibility and mobile

None beyond a valid HTTPS certificate on the chosen domain, which installation to a home screen requires.

## Out of scope

Preview deployments for pull requests. Analytics and error reporting. A marketing site. Any server component.

## Dependencies

Packages 00 and 02, and decision 1.
