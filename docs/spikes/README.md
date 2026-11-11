# Spikes

A spike is a small throwaway experiment that answers one technical question before the real build starts. Spike code lives under `spikes/<letter>/` and is never imported by the app. What survives is the findings file `docs/spikes/results/<letter>.md`.

Read `docs/PLAN.md` first. The pass thresholds in each spec come from its performance budgets (section 6), which are proposed targets. If a spike shows a budget is wrong, say so in the findings with the numbers.

## Order

Prose comes first in the build, so the spikes are ordered to match.

| Spike | Question | Needed for |
|---|---|---|
| A, `A-editor-scale.md` | Can ProseMirror edit a 300,000-word project smoothly on a phone, and how much windowing does that take? | Phase 1 |
| B, `B-storage.md` | Is SQLite on OPFS with one Yjs document per scene fast and durable on phones? | Phase 1 |
| C, `C-pagination.md` | Can one TypeScript paginator give correct, live screenplay pages and drive the PDF? | Phase 2 |

A and B are independent and may run in parallel: A uses in-memory data and B has no editor. C starts after A, because it reuses A's conclusions about where layout work runs.

Shared helpers, such as the generator for the 300,000-word test project, go in `spikes/shared/`. The generator is deterministic (fixed seed): about 150 chapters and 600 scenes, scene lengths from 100 to 3,000 words, plus one 10,000-word scene as the worst case.

## Rules for every spike

- Answer the question and stop. No design polish, no features outside the spec.
- Use only dependencies whose licence is compatible with AGPL-3.0 (see `docs/PLAN.md`, section 5). Record each dependency and its licence in the findings.
- Measure a production build. Development servers distort timing.
- Automated measurements run in desktop browsers and give a first signal only. The manual phone checklist is the result that counts.
- The findings file gives: the numbers against each threshold, what failed and why, and one recommendation.

## Go or no-go

The results decide the architecture before phase 1 starts.

- **A passes with the simplest variant:** use it. Do not build more windowing than the numbers require.
- **A passes only with per-scene windowing:** accept the extra work (selection, find and scroll anchoring across unmounted scenes) and plan phase 1 around it.
- **A fails everywhere:** fall back to editing one chapter at a time with a read-only continuous view, and re-plan.
- **B passes with one storage layer:** use that one. If both pass, prefer the one that needs no special response headers.
- **B fails on durability or speed:** evaluate Loro for the documents or IndexedDB for storage, in that order, as a follow-up spike.
- **C fails on accuracy:** keep the engine for live estimates and research a stricter rule set before phase 2; do not start phase 2 without a pass.

## Testing on a phone

OPFS and service workers need a secure context, which on a phone means HTTPS with a valid certificate.

Options:

| Option | Reach | Public? | Cost |
|---|---|---|---|
| 1. Tailscale Serve on a new HTTPS port, proxying the spike's local preview server | Any device on the tailnet | No | One command to add and one to remove. Each port is its own origin, so its storage is separate. |
| 2. A new Cloudflare Tunnel hostname | Anyone | Yes, unless put behind Cloudflare Access | Root edit of the tunnel configuration, a DNS record, and a restart that briefly interrupts the hostnames already served. |
| 3. Tailscale Funnel | Anyone | Yes | One command; exposes the host directly. |
| 4. Static hosting from CI (for example GitHub Pages) | Anyone | Yes | Needs the GitHub repository. Cannot set the response headers that SQLite's `opfs` storage layer requires. |
| 5. `localhost` on the build host | The host only | No | Desktop browsers only; no phone. |

**Recommendation: option 1.** It gives a valid certificate and a secure context and exposes nothing publicly. The iPhone and the Android test phone must both be signed in to the tailnet.

Notes for whoever serves a spike:

- Serve the production build with a static preview server bound to `127.0.0.1`.
- Spike B compares a storage layer that needs cross-origin isolation. The preview server must then send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- Install the page to the Home Screen before measuring on iOS; storage rules differ between Safari tabs and Home Screen web apps.
