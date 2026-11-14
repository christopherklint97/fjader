# Spike A results: editing at scale

Status: the automated part is done. **The manual phone checklist has not been run**; it needs a real iPhone and a real Android phone, and by the spec those results are the ones that count. Everything below is a first signal from headless desktop browsers on the build host.

Code: `spikes/a/` (the spec says `spikes/A/`; lower case is used instead). Fixture generator: `spikes/shared/fixture.ts`. Raw result files: `spikes/a/results/`. Phone demo: the build is copied to a static demo host.

## 1. Answer

**Provisional recommendation: variant 3, one ProseMirror editor per scene with only the scenes near the viewport mounted.** It is provisional because no real phone has been tested.

| Threshold | 1 Single editor | 2 Single editor + `content-visibility` | 3 Per-scene editors, windowed |
|---|---|---|---|
| Editable cursor mid-project, at most 1.5 s | Chromium 0.71 s at 1x, **3.1 s at 4x (fail)**; WebKit 1.09 s | 0.28 s / 1.01 s at 4x; WebKit 0.61 s. Pass | 0.23 s / 0.79 s at 4x; WebKit 0.61 s. Pass |
| Keystroke p95 at most 32 ms, 500-word scene | Chromium **32.4 at 1x, 182 at 4x (fail)**; WebKit 19 | 6.9 / 23.3 at 4x; WebKit 17. Pass | 7.2 / 24.1 at 4x; WebKit 25. Pass |
| Keystroke p95 at most 32 ms, 10,000-word scene | Chromium **34.0 at 1x, 157 at 4x (fail)**; WebKit 22 | 8.6 / 28.2 at 4x; WebKit 17. Pass | 8.1 at 1x, pass; **44.3 at 4x (fail at 4x only)**; WebKit 16 |
| Keystroke p99 at most 100 ms | Chromium 38 and 58 at 1x; **381 and 268 at 4x (fail)**; WebKit 23 and 26 | 13 and 16 / 28 and 44 at 4x; WebKit 19 and 18. Pass | 15 and 14 / 37 and 91 at 4x; WebKit 97 and 17. Pass (the 97 is painting, see section 4) |
| Jump to any scene, at most 200 ms | at most 46. Pass | at most 58. Pass | at most 27 at 1x, 107 at 4x, 130 in WebKit (the 10,000-word scene). Pass |
| Scroll shift at most 1 px | 0.00. Pass | Chromium 0.00, pass; **WebKit 28 px (fail)** | 0.00 in every run, including real touch flicks in Chromium. Pass |
| No blank over 100 ms in a fling (proxy: longest frame) | Chromium 67 ms at 1x, 83 at 4x | 17 to 50 ms | 17 to 50 ms at 1x; **one 200 ms frame in the scripted fling at 4x**, 33 ms in the touch flicks |
| JavaScript heap at most 150 MB | 7.9 MB. Pass | 7.7 MB. Pass | 9.9 MB with all 600 scenes opened. Pass |
| Functional defects found | none | **WebKit inserts typed text in the wrong chapter** after a programmatic selection (repairable, see section 4) | undo is per scene; browser find sees only mounted text; touch selection across scenes not solved |
| Manual phone checklist | not run | not run | not run |
| **Automated verdict** | **Fail** (typing in Chromium, opening at 4x) | **Pass in Chromium, fail in WebKit** | **Pass at 1x in both engines; two misses at 4x** |

"1x" is this host unthrottled, which I believe is close to a 2022 mid-range Android phone; "4x" is far slower than the budget's target phones (section 2). Figures are from the second full run (12 November, final build); the first run (11 November, commit `968ffe7`) agrees except where noted in section 4.

Why variant 3 and not variant 2, although 2 is simpler and at least as fast in Chromium:

1. Variant 2 fails two things in WebKit, the engine every iPhone browser uses: a 28 px jump whenever a chapter above the viewport is first rendered, and typed text landing in the wrong chapter. Both come from how WebKit treats skipped content, not from our code.
2. Variant 2 still has to load and build the whole project to open it. That contradicts the scene-sized documents of PLAN §4 and needs one editor document bound to 600 Yjs documents. Variant 3 maps one scene to one editor to one stored document.
3. Variant 3's open problems are work we control (section 5). Variant 2's are browser behaviour we can only guard against.

What would change the recommendation: if a real iPhone shows variant 2 without the jump and without misplaced text, and spike B shows that loading 600 scene bodies at open is cheap, variant 2 becomes the simpler passing variant and saves the cross-scene work. If a real iPhone shows variant 3's scroll corrections breaking momentum scrolling and browser anchoring does not rescue it, variant 3 needs the heavier anchoring design in section 5 before it can be chosen.

Variant 1 is out in any case: its typing cost is in the browser's own editing code and grows with the size of the editable region.

## 2. Method, and what it can and cannot show

- **Host:** Raspberry Pi 5 Model B (4 cores, 8 GB), Debian 13, arm64. All browser processes of a run share a CPU cap with every other workload on the host. Each result file records the load average and how long the shared CPU group was throttled during the run; the run-conditions table in section 3 shows both.
- **Browsers:** Playwright 1.64.1. Chromium 156.0.8078.4 (headless shell). WebKit 27.2 (the WPE build Playwright ships for Linux).
- **WebKit did not install cleanly.** The host lacks three system libraries (`libharfbuzz-icu0`, `libmanette-0.2-0`, `libhyphen0`). I did not install system packages. I downloaded those three Debian packages with `apt-get download`, unpacked them into `~/.cache/spike-a-webkit-libs/`, and linked the libraries into the WebKit bundle's own `sys/lib` directory in the Playwright cache. WebKit then runs. This WebKit is not Safari: it shares the engine core (DOM, editing, layout, JavaScript) but not the iOS text input, scrolling, compositing or memory behaviour.
- **Page:** production build (`vite build`), served from `127.0.0.1`. Viewport 390 x 844 CSS px, device pixel ratio 2, touch enabled; Chromium also in mobile emulation.
- **CPU throttling:** Chromium only, through the DevTools protocol, at 4x as the spec asks, and also at 1x. WebKit automation has no CPU throttle, so WebKit runs at 1x only.
- **How fast is 1x here?** One Pi 5 core is, by my recollection of public single-core benchmarks (not measured here, not checked), in the class of a 2022 mid-range Android phone and roughly a third of an iPhone 12. If that is right, **1x on this host is already close to the Android target, and 4x is far slower than any phone in the budget's target class.** The spec's "throttled four times" assumes a desktop CPU. Read the 4x column as a pessimistic bound, not as the phone.
- **Keystroke latency:** 500 characters typed through the browser's real key event path (`keyboard.type`, 80 ms between keys), once in the middle of the 500-word scene and once in the middle of the 10,000-word scene. Two measures:
  - *Frame measure* (all browsers): from the key event's timestamp to the first frame produced after the editor applied the text (`requestAnimationFrame`, then a task). This is also what the on-screen readout shows.
  - *Event Timing API* (both browsers have it): per keystroke, the latest presentation time of its events. The API does not report events under 16 ms and rounds to 8 ms.
  - Headless browsers here produce a frame as soon as one is needed. A real 60 Hz screen adds up to 16.7 ms of waiting for the next refresh on top of these figures.
- **Time to cursor:** new browser context each time (no HTTP cache, no code cache), 5 runs. From navigation start to the frame that shows a focused, editable caret in the middle of scene 300. It includes generating the fixture in memory, which stands in for loading from storage; real storage is spike B.
- **Jump:** from the call to the frame with the caret at the start of the target scene. 5 rounds over first, middle, last and the 10,000-word scene, plus 5 scenes never visited before.
- **Scroll stability:** a visible paragraph is tracked every frame; its movement is compared with the scroll distance. Three drivers: scripted slow scroll (600 px/s, 12 s up then 12 s down), scripted fling (starts at 12,000 px/s, decays, up then down), and in Chromium real touch flicks sent as raw touch events, so the browser's own gesture and fling code scrolls. Scrolls start in a part of the project that has never been rendered, so heights above the viewport are estimates. A control run of variant 3 with all anchoring switched off shows the test does see the shift that anchoring removes (28 px, in exactly the frames where the anchored run made a correction).
- **Blank areas:** variant 3 mounts every scene that intersects the viewport inside the scroll event, before the frame is painted, so the main thread never paints a blank viewport; the cost shows up as a long frame instead. A long main-thread frame during a real fling is what a phone would show as a blank or stale area, because the compositor keeps scrolling. So the "longest frame during a fling" column is the proxy for the 100 ms blank budget. What the compositor actually shows cannot be seen from script.
- **Heap:** Chromium only: JavaScript heap after a forced garbage collection, plus the renderer process's resident memory. WebKit automation exposes neither.
- **Not exercised at all by automation:** on-screen keyboards, autocorrect, dictation, swipe typing, selection handles, momentum scrolling on iOS, the keyboard's effect on the viewport, memory pressure kills, spellcheck (headless browsers have no dictionary), a GPU.

## 3. Numbers

Second full run, final build, 12 November 2026. Generated by `node measure/report.mjs results` from `spikes/a/results/*.json`. "n/m" means not measurable: during a browser-driven scroll the test cannot tell the browser's own anchoring adjustments from real movement. "LayoutShift entries" is Chromium's Layout Instability API; it counts variant 3's manual corrections as shifts although the tracked paragraph does not move.

### Time from navigation to an editable cursor mid-project (ms)

| Run | Variant | median | max | n | generate fixture | build editor | place cursor (layout) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chromium 156, CPU 1x | 1 | 713 | 763 | 5 | 46 | 67 | 343 |
| Chromium 156, CPU 1x | 2 | 276 | 286 | 5 | 47 | 66 | 11 |
| Chromium 156, CPU 1x | 3 | 229 | 256 | 5 | 47 | 29 | 13 |
| Chromium 156, CPU 4x | 1 | 3067 | 5573 | 5 | 171 | 274 | 1682 |
| Chromium 156, CPU 4x | 2 | 1013 | 1020 | 5 | 176 | 284 | 47 |
| Chromium 156, CPU 4x | 3 | 790 | 798 | 5 | 176 | 124 | 56 |
| WebKit 27, CPU 1x (no throttle) | 1 | 1087 | 1267 | 5 | 83 | 192 | 550 |
| WebKit 27, CPU 1x (no throttle) | 2 | 605 | 616 | 5 | 74 | 188 | 118 |
| WebKit 27, CPU 1x (no throttle) | 3 | 613 | 623 | 5 | 160 | 130 | 56 |

### Keystroke latency, key received to next frame (ms)

| Run | Variant | Where | n | p50 | p95 | p99 | max | Event Timing p95 / p99 | text intact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chromium 156, CPU 1x | 1 | 500-word scene | 500 | 25.9 | 32.4 | 37.7 | 41.3 | 36 / 41 (0 of 500 under 16) | yes |
| Chromium 156, CPU 1x | 1 | 10,000-word scene | 500 | 26.9 | 34.0 | 57.5 | 97.1 | 40 / 66 (0 of 500 under 16) | yes |
| Chromium 156, CPU 1x | 2 | 500-word scene | 500 | 4.5 | 6.9 | 13.2 | 15.6 | ≤16 / 18 (482 of 500 under 16) | yes |
| Chromium 156, CPU 1x | 2 | 10,000-word scene | 500 | 6.0 | 8.6 | 16.2 | 18.9 | ≤16 / 19 (476 of 500 under 16) | yes |
| Chromium 156, CPU 1x | 3 | 500-word scene | 500 | 5.1 | 7.2 | 14.5 | 18.6 | ≤16 / 18 (483 of 500 under 16) | yes |
| Chromium 156, CPU 1x | 3 | 10,000-word scene | 500 | 6.3 | 8.1 | 13.5 | 16.8 | ≤16 / 18 (475 of 500 under 16) | yes |
| Chromium 156, CPU 4x | 1 | 500-word scene | 495 | 101.2 | 182.4 | 380.7 | 1102.3 | 188 / 384 (0 of 495 under 16) | yes |
| Chromium 156, CPU 4x | 1 | 10,000-word scene | 497 | 105.6 | 156.5 | 267.7 | 398.7 | 160 / 276 (0 of 497 under 16) | yes |
| Chromium 156, CPU 4x | 2 | 500-word scene | 500 | 17.2 | 23.3 | 27.9 | 55.0 | 26 / 33 (0 of 500 under 16) | yes |
| Chromium 156, CPU 4x | 2 | 10,000-word scene | 500 | 20.5 | 28.2 | 43.5 | 91.5 | 32 / 45 (0 of 500 under 16) | yes |
| Chromium 156, CPU 4x | 3 | 500-word scene | 500 | 17.9 | 24.1 | 37.0 | 191.7 | 26 / 38 (0 of 500 under 16) | yes |
| Chromium 156, CPU 4x | 3 | 10,000-word scene | 500 | 21.8 | 44.3 | 90.6 | 121.8 | 51 / 96 (0 of 500 under 16) | yes |
| WebKit 27, CPU 1x (no throttle) | 1 | 500-word scene | 500 | 16.0 | 19.0 | 23.0 | 38.0 | 19 / 24 (0 of 500 under 16) | yes |
| WebKit 27, CPU 1x (no throttle) | 1 | 10,000-word scene | 500 | 18.0 | 22.0 | 26.0 | 32.0 | 19 / 24 (0 of 500 under 16) | yes |
| WebKit 27, CPU 1x (no throttle) | 2 | 500-word scene | 500 | 10.0 | 17.0 | 19.0 | 24.0 | 18 / 19 (343 of 500 under 16) | yes |
| WebKit 27, CPU 1x (no throttle) | 2 | 10,000-word scene | 500 | 10.0 | 17.0 | 18.0 | 22.0 | 18 / 19 (327 of 500 under 16) | yes |
| WebKit 27, CPU 1x (no throttle) | 3 | 500-word scene | 496 | 12.0 | 25.0 | 97.0 | 119.0 | 25 / 83 (275 of 496 under 16) | yes |
| WebKit 27, CPU 1x (no throttle) | 3 | 10,000-word scene | 500 | 9.0 | 16.0 | 17.0 | 25.0 | 18 / 19 (347 of 500 under 16) | yes |

### Jump to a scene, call to next frame (ms): first visit / median of 5 / max

| Run | Variant | first scene | middle scene | last scene | 10,000-word scene | never-visited scenes (5 different) |
| --- | --- | --- | --- | --- | --- | --- |
| Chromium 156, CPU 1x | 1 | 5 / 6 / 7 | 7 / 7 / 7 | 7 / 7 / 8 | 6 / 7 / 8 | 6 / 7 / 15 |
| Chromium 156, CPU 1x | 2 | 9 / 5 / 9 | 5 / 5 / 5 | 12 / 5 / 12 | 7 / 6 / 8 | 15 / 10 / 15 |
| Chromium 156, CPU 1x | 3 | 8 / 8 / 8 | 9 / 9 / 9 | 13 / 10 / 13 | 27 / 27 / 27 | 15 / 13 / 21 |
| Chromium 156, CPU 4x | 1 | 21 / 21 / 24 | 27 / 25 / 27 | 38 / 25 / 38 | 24 / 24 / 25 | 22 / 23 / 25 |
| Chromium 156, CPU 4x | 2 | 28 / 16 / 28 | 18 / 17 / 19 | 58 / 20 / 58 | 25 / 24 / 25 | 41 / 37 / 53 |
| Chromium 156, CPU 4x | 3 | 39 / 39 / 43 | 46 / 46 / 57 | 54 / 45 / 60 | 104 / 101 / 107 | 71 / 55 / 71 |
| WebKit 27, CPU 1x (no throttle) | 1 | 25 / 20 / 25 | 23 / 21 / 29 | 46 / 29 / 46 | 20 / 23 / 28 | 15 / 15 / 28 |
| WebKit 27, CPU 1x (no throttle) | 2 | 20 / 12 / 20 | 17 / 16 / 17 | 40 / 12 / 40 | 19 / 19 / 20 | 24 / 16 / 24 |
| WebKit 27, CPU 1x (no throttle) | 3 | 20 / 10 / 20 | 25 / 11 / 25 | 21 / 15 / 21 | 130 / 23 / 130 | 17 / 16 / 18 |

### Scroll stability

| Run | Variant | Scroll | px | max shift px | frames > 1 px | mounts | scrollTop corrections | longest blank ms | frame p95 ms | frame max ms | LayoutShift entries |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chromium 156, CPU 1x | 1 | scripted slow | 14400 | 0.00 | 0 of 1431 | - | - | 0 | 17 | 67 | 0 |
| Chromium 156, CPU 1x | 1 | scripted fling | 28521 | 0.00 | 0 of 702 | - | - | 0 | 33 | 67 | 0 |
| Chromium 156, CPU 1x | 1 | touch flicks | 28906 | 0.00 | 0 of 454 | - | - | 0 | 17 | 33 | 0 |
| Chromium 156, CPU 1x | 2 | scripted slow | 14400 | 0.00 | 0 of 1441 | - | - | 0 | 17 | 17 | 0 |
| Chromium 156, CPU 1x | 2 | scripted fling | 28658 | 0.00 | 0 of 764 | - | - | 0 | 17 | 17 | 0 |
| Chromium 156, CPU 1x | 2 | touch flicks | 24346 | n/m | n/m | - | - | 0 | 17 | 17 | 0 |
| Chromium 156, CPU 1x | 3 | scripted slow | 14400 | 0.00 | 0 of 1441 | 5 | 2 | 0 | 17 | 17 | 2 |
| Chromium 156, CPU 1x | 3 | scripted fling | 28642 | 0.00 | 0 of 764 | 15 | 5 | 0 | 17 | 17 | 4 |
| Chromium 156, CPU 1x | 3 | scripted, up into the 10k scene | 7500 | 0.00 | 0 of 301 | 1 | 0 | 0 | 17 | 17 | - |
| Chromium 156, CPU 1x | 3 | touch flicks | 71270 | 0.00 | 0 of 450 | 41 | 9 | 0 | 17 | 50 | 8 |
| Chromium 156, CPU 1x | 3 (browser anchoring) | scripted slow | 14400 | 0.00 | 0 of 1329 | 5 | 0 | 0 | 33 | 67 | 0 |
| Chromium 156, CPU 1x | 3 (browser anchoring) | scripted fling | 28593 | 0.00 | 0 of 752 | 15 | 0 | 0 | 17 | 50 | 0 |
| Chromium 156, CPU 1x | 3 (browser anchoring) | scripted, up into the 10k scene | 7500 | 0.00 | 0 of 274 | 1 | 0 | 0 | 33 | 67 | - |
| Chromium 156, CPU 1x | 3 (browser anchoring) | touch flicks | 29287 | n/m | n/m | 16 | 0 | 0 | 17 | 17 | 0 |
| Chromium 156, CPU 1x | 3 (no anchoring, control) | scripted slow | 14400 | 28.00 | 2 of 1441 | 5 | 0 | 0 | 17 | 17 | - |
| Chromium 156, CPU 1x | 3 (no anchoring, control) | scripted fling | 28626 | 28.00 | 5 of 764 | 15 | 0 | 0 | 17 | 17 | - |
| Chromium 156, CPU 4x | 1 | scripted slow | 14400 | 0.00 | 0 of 1359 | - | - | 0 | 17 | 100 | 0 |
| Chromium 156, CPU 4x | 1 | scripted fling | 28651 | 0.00 | 0 of 739 | - | - | 0 | 17 | 67 | 0 |
| Chromium 156, CPU 4x | 1 | touch flicks | 11745 | 0.00 | 0 of 451 | - | - | 0 | 17 | 83 | 0 |
| Chromium 156, CPU 4x | 2 | scripted slow | 14400 | 0.00 | 0 of 1426 | - | - | 0 | 17 | 67 | 0 |
| Chromium 156, CPU 4x | 2 | scripted fling | 28579 | 0.00 | 0 of 749 | - | - | 0 | 17 | 50 | 0 |
| Chromium 156, CPU 4x | 2 | touch flicks | 42410 | n/m | n/m | - | - | 0 | 17 | 33 | 0 |
| Chromium 156, CPU 4x | 3 | scripted slow | 14400 | 0.00 | 0 of 1345 | 5 | 2 | 0 | 17 | 83 | 2 |
| Chromium 156, CPU 4x | 3 | scripted fling | 28639 | 0.00 | 0 of 648 | 15 | 5 | 0 | 33 | 200 | 4 |
| Chromium 156, CPU 4x | 3 | scripted, up into the 10k scene | 7500 | 0.00 | 0 of 261 | 1 | 0 | 0 | 50 | 67 | - |
| Chromium 156, CPU 4x | 3 | touch flicks | 37522 | 0.00 | 0 of 449 | 21 | 3 | 0 | 17 | 33 | 3 |
| Chromium 156, CPU 4x | 3 (browser anchoring) | scripted slow | 14400 | 0.00 | 0 of 1441 | 5 | 0 | 0 | 17 | 17 | 0 |
| Chromium 156, CPU 4x | 3 (browser anchoring) | scripted fling | 28539 | 0.00 | 0 of 763 | 15 | 0 | 0 | 17 | 17 | 0 |
| Chromium 156, CPU 4x | 3 (browser anchoring) | scripted, up into the 10k scene | 7500 | 0.00 | 0 of 297 | 1 | 0 | 0 | 17 | 83 | - |
| Chromium 156, CPU 4x | 3 (browser anchoring) | touch flicks | 23020 | n/m | n/m | 11 | 0 | 0 | 17 | 33 | 0 |
| Chromium 156, CPU 4x | 3 (no anchoring, control) | scripted slow | 14400 | 28.00 | 2 of 1434 | 5 | 0 | 0 | 17 | 50 | - |
| Chromium 156, CPU 4x | 3 (no anchoring, control) | scripted fling | 28588 | 28.00 | 5 of 764 | 15 | 0 | 0 | 17 | 17 | - |
| WebKit 27, CPU 1x (no throttle) | 1 | scripted slow | 14011 | 0.00 | 0 of 274 | - | - | 0 | 103 | 204 | 0 |
| WebKit 27, CPU 1x (no throttle) | 1 | scripted fling | 28219 | 0.00 | 0 of 155 | - | - | 0 | 100 | 111 | 0 |
| WebKit 27, CPU 1x (no throttle) | 2 | scripted slow | 14054 | 28.00 | 1 of 250 | - | - | 0 | 111 | 152 | 0 |
| WebKit 27, CPU 1x (no throttle) | 2 | scripted fling | 24378 | 28.00 | 1 of 127 | - | - | 0 | 152 | 194 | 0 |
| WebKit 27, CPU 1x (no throttle) | 3 | scripted slow | 14335 | 0.00 | 0 of 284 | 5 | 2 | 0 | 100 | 111 | 0 |
| WebKit 27, CPU 1x (no throttle) | 3 | scripted fling | 28506 | 0.00 | 0 of 149 | 14 | 6 | 0 | 100 | 104 | 0 |
| WebKit 27, CPU 1x (no throttle) | 3 | scripted, up into the 10k scene | 7466 | 0.00 | 0 of 61 | 1 | 0 | 0 | 100 | 104 | - |
| WebKit 27, CPU 1x (no throttle) | 3 (browser anchoring) | scripted slow | 14347 | 0.00 | 0 of 285 | 5 | 0 | 0 | 100 | 108 | 0 |
| WebKit 27, CPU 1x (no throttle) | 3 (browser anchoring) | scripted fling | 28055 | 0.00 | 0 of 151 | 14 | 0 | 0 | 101 | 113 | 0 |
| WebKit 27, CPU 1x (no throttle) | 3 (browser anchoring) | scripted, up into the 10k scene | 7447 | 0.00 | 0 of 61 | 1 | 0 | 0 | 98 | 118 | - |
| WebKit 27, CPU 1x (no throttle) | 3 (no anchoring, control) | scripted slow | 14331 | 28.00 | 2 of 284 | 5 | 0 | 0 | 99 | 111 | - |
| WebKit 27, CPU 1x (no throttle) | 3 (no anchoring, control) | scripted fling | 28211 | 28.00 | 6 of 150 | 14 | 0 | 0 | 101 | 148 | - |

### Size

| Run | Variant | editors mounted | DOM elements | text nodes | JS heap after load MB | JS heap after use MB | renderer RSS after load MB | renderer RSS after use MB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chromium 156, CPU 1x | 1 | 1 | 6861 | 6548 | 6.4 | 7.9 | 204 | 218 |
| Chromium 156, CPU 1x | 2 | 1 | 6861 | 6548 | 6.3 | 7.6 | 132 | 156 |
| Chromium 156, CPU 1x | 3 | 3 | 840 | 228 | 5.5 | 9.8 (all 600 scenes opened) | 129 | 156 |
| Chromium 156, CPU 4x | 1 | 1 | 6861 | 6548 | 6.5 | 7.9 | 204 | 216 |
| Chromium 156, CPU 4x | 2 | 1 | 6861 | 6548 | 6.4 | 7.7 | 131 | 155 |
| Chromium 156, CPU 4x | 3 | 3 | 840 | 228 | 5.5 | 9.9 (all 600 scenes opened) | 131 | 154 |
| WebKit 27, CPU 1x (no throttle) | 1 | 1 | 6861 | 6548 | n/a | n/a | n/a | n/a |
| WebKit 27, CPU 1x (no throttle) | 2 | 1 | 6861 | 6548 | n/a | n/a | n/a | n/a |
| WebKit 27, CPU 1x (no throttle) | 3 | 3 | 840 | 228 | n/a | n/a (all 600 scenes opened) | n/a | n/a |

### In-app find for "the" (ms)

| Run | Variant | matches | compute median | compute max | to painted count median | to painted count max |
| --- | --- | --- | --- | --- | --- | --- |
| Chromium 156, CPU 1x | 1 | 25044 | 7.8 | 11.4 | 49.3 | 52.0 |
| Chromium 156, CPU 1x | 2 | 25044 | 9.4 | 13.2 | 18.1 | 25.5 |
| Chromium 156, CPU 1x | 3 | 25044 | 3.7 | 14.6 | 8.6 | 19.7 |
| Chromium 156, CPU 4x | 1 | 25044 | 35.9 | 39.2 | 121.8 | 208.0 |
| Chromium 156, CPU 4x | 2 | 25044 | 33.1 | 41.7 | 60.8 | 75.1 |
| Chromium 156, CPU 4x | 3 | 25044 | 16.0 | 58.6 | 38.1 | 80.2 |
| WebKit 27, CPU 1x (no throttle) | 1 | 25044 | 16.0 | 28.0 | 26.0 | 81.0 |
| WebKit 27, CPU 1x (no throttle) | 2 | 25044 | 33.0 | 56.0 | 58.0 | 72.0 |
| WebKit 27, CPU 1x (no throttle) | 3 | 25044 | 3.0 | 16.0 | 31.0 | 81.0 |

### Run conditions

| Run | browser version | started | load average start / end | cgroup CPU-throttled time during run (s) |
| --- | --- | --- | --- | --- |
| Chromium 156, CPU 1x | 156.0.8078.4 | 2026-11-12T18:48:40.403Z | 1.37 / 1.16 | 0.9 |
| Chromium 156, CPU 4x | 156.0.8078.4 | 2026-11-12T18:37:21.459Z | 0.41 / 1.37 | 1.6 |
| WebKit 27, CPU 1x (no throttle) | 27.2 | 2026-11-12T18:57:56.133Z | 1.16 / 3.09 | 6.8 |

### Functional checks (`measure/functional.mjs`, final build)

| Browser | Passed | Failed |
|---|---|---|
| Chromium 156 | 23 of 25 | One undo does not revert a cross-scene join (history is per scene). Browser find-in-page reaches only mounted text. Both expected. |
| WebKit 27.2 | 22 of 25 | The same two, and: variant 2 with the selection repair off puts typed text in the wrong chapter in 3 of 3 jumps. One check (composition pinning) is skipped in WebKit: its automation cannot drive an input method. |

The passing checks cover: arrow keys and Backspace across scene boundaries, mouse drag and Shift+arrow selection across scenes, copy of a cross-scene selection and of the whole project against the model text, typing over a cross-scene selection, find count and jump to a match in an unmounted scene, the caret scene and a composing scene staying mounted when scrolled 60,000 px away. Per-check detail is in `spikes/a/results/functional-*.json`.

## 4. What failed, and why

### Variant 1 (single editor): fails

- **Typing in Chromium.** At 1x the 95th percentile is 32 to 34 ms (37 to 42 ms in the first run, with a 99th percentile of 82 to 99 ms), and at 4x it is 157 to 182 ms. The other variants are at 7 to 9 ms at 1x. A trace of 100 keystrokes at 1x (`measure/profile-typing.mjs`, CPU time on the renderer main thread, so other load on the host does not distort it) shows where it goes:

  | Per keystroke, CPU ms | Variant 1 | Variant 2 | Variant 3 |
  |---|---|---|---|
  | All tasks | 39.4 | 8.3 | 7.3 |
  | Browser's own text insertion (`TypingCommand::InsertText`) | 23.2 | 2.8 | 2.8 |
  | of which re-syncing the selection (`FrameSelection::SetSelection`) | 16.7 | not in the top 12 | not in the top 12 |
  | Compositing inputs update before paint | 8.2 | under 0.4 | under 0.7 |
  | Hit test for a synthetic mouse move | 8.8 | 0.2 | 0.04 |
  | Layout | 1.2 | 0.5 | 1.0 |
  | ProseMirror and other JavaScript (`FunctionCall`) | 3.8 | 2.6 | 1.9 |

  The time is not in ProseMirror and not in layout. It is in Blink's own editing, selection and pre-paint bookkeeping, which grows with the size of the one editable region. That matches the forum report of Chrome lag "attributed to DOM node count" (research §1). The hit-test part needs a mouse pointer and probably does not occur on a touch phone; the other two parts have no such excuse. WebKit does not show this cost (variant 1 types at a 16 to 18 ms median and 19 to 22 ms at the 95th percentile there), which matches the other report of whole novels being responsive.
- **Opening.** 0.7 s at 1x, 3.1 s at 4x (worst of five 5.6 s), 1.1 s in WebKit. Half of it is one forced layout of 1.7 million characters to place the caret; that cost is the browser's and cannot be deferred in a single editor without skipping rendering, which is variant 2.
- **Memory.** The JavaScript heap is small in every variant (under 10 MB). The renderer process is about 70 MB larger for variant 1 (200 MB against 130 MB), which is layout data for text that is not on screen.

### Variant 2 (single editor, `content-visibility: auto` per chapter): passes the numbers in Chromium, has two real defects in WebKit

- **WebKit puts typed text in the wrong chapter after a programmatic selection.** Reproduced every time (`measure/functional.mjs`, 3 of 3 jumps): open or jump to a position in a chapter that was not rendered, type, and the characters are inserted as a new block at the start of the *next* chapter. Cause, established with event logging: when the selection is set inside content that `content-visibility` is skipping, WebKit resolves it internally to the nearest rendered position, which is the next chapter's first node. `getSelection()` keeps reporting the position we set, the caret is drawn there, but `beforeinput` already targets the other chapter and the insertion follows it. Setting the same selection again once the chapter has rendered repairs it; the spike does that after jumps and find (`?v2fix=0` turns the repair off). Every other programmatic selection would need the same guard: restoring the last position, undo and redo that move the caret far away, find-and-replace, AI insertions. A missed case silently moves the writer's text. Not checked on iOS Safari; it is the same engine code, so I expect it there.
- **WebKit lets the page jump when a chapter above the viewport is first rendered.** A chapter's size hint is an estimate; when it comes near the viewport and gets its real size, everything below moves by the difference (28 px in the trace: chapter 46 went from 8,228 to 8,256 px). Chromium's scroll anchoring absorbs this; WebKit's does not for this kind of size change, although it does anchor ordinary DOM changes (variant 3 with browser anchoring shows no shift in WebKit). It showed as one 28 px jump in each scripted scroll test, in both runs. Exact hints would hide it; the hints here are off by one or two lines for about a third of the scenes.
- **It still loads and builds the whole project to open it.** Fine with an in-memory fixture (building the document and its DOM takes 66 ms at 1x and 284 ms at 4x). With storage it means reading and decoding all 600 scene bodies before the first caret, and binding one editor document to 600 separate Yjs documents, which the stock binding does not do. That is outside this spike but decides whether variant 2 is really "simpler".
- What it gets for free, and variant 3 does not: native selection across scenes, native copy, one undo history, the whole text in the accessibility tree, and browser find-in-page where the browser supports it for skipped content.

### Variant 3 (one editor per scene, windowed): passes the numbers; the cost is functional work

- **At 1x everything is inside the budgets in both engines**, with margin: keystroke p95 7 to 8 ms in Chromium, opening in 0.23 s, jumps in at most 27 ms, 0.00 px shift, 840 DOM elements against 6,861.
- **At 4x two figures miss.** Typing in the 10,000-word scene has a p95 of 44 ms (34 ms in the first run) against 32. A 10,000-word scene is itself a large editor, so it shows the variant 1 effect on a small scale; the 500-word scene stays at 24 ms. And one frame of the scripted fling took 200 ms (83 ms in the first run). Scrolling up into the 10,000-word scene, the most expensive single mount, cost a 67 ms frame at 4x and 17 ms at 1x; jumping to it costs 104 ms at 4x. If phones show this, the remedy is to cap how much of a very long scene one editor holds, not a different architecture.
- **WebKit typing tail is painting, not the editor.** In the 500-word scene WebKit shows bursts of frames around 100 ms (p99 97 ms; 16 of 391 keystrokes over 40 ms in a repeat on an idle host). The same test at device pixel ratio 1 instead of 2 has none: p95 17, p99 18, max 21 ms (`measure/webkit-tail.mjs`). This WebKit build paints in software on this host, and every scroll frame takes about 100 ms in all three variants, including the static variant 1. Variant 2 showed the same bursts once. So I do not count it against variant 3, but it is exactly the kind of figure only the iPhone can settle.
- **First WebKit run discarded.** On 11 November the WebKit run overlapped with other browser tests in the same CPU group (24 s of throttling); its variant 3 typing figures (p95 104 ms) were contention. The second run had 7 s of throttling over nine minutes, at most 0.12 s inside any typing test.

What was built, and what is awkward:

| Area | In the spike | Works in automation | Awkward or open |
|---|---|---|---|
| Windowing | Scenes within 2 screens are mounted. Scenes in the viewport mount inside the scroll event; overscan scenes mount one per frame. Placeholders keep the measured height; never-seen scenes use an estimate from character count. The scene with the selection, its neighbours, any scene with an active composition, and the ends of a cross-scene selection are never unmounted. | Yes, both engines. Composition pinning verified in Chromium with a real IME composition through the DevTools protocol. | Estimates are off by 1 to 2 lines for about a third of scenes, so corrections are routine, not rare. A width change (rotation) throws all remembered heights away. The scrollbar length drifts as estimates are replaced. |
| Scroll anchoring | When heights change above the viewport, `scrollTop` is corrected in the same task, before paint (`overflow-anchor: none`). `?anchor=native` leaves it to the browser instead. | 0.00 px shift in every run, including real touch flicks in Chromium. Browser anchoring also gives 0.00 px in both engines. | **Writing `scrollTop` during an iOS momentum scroll is the main unverified risk**; historically it stops the momentum or is overwritten. If it fails on the phone: use browser anchoring where it works, or keep slots absolutely positioned and re-base offsets only when the scroll is at rest. |
| Arrow keys, Backspace | Left/Right at a scene edge, Up/Down on the first/last line (keeps the column), Backspace at a scene start joins the paragraph onto the previous scene. | Yes, both engines. | Not built: Delete at a scene end, word and line jumps (Alt/Cmd+arrows), Page Up/Down, document start/end. Each needs an edge rule. |
| Selection across scenes | The browser will not extend a selection out of the editor it started in (confirmed: native drag stays in the first scene). So the app keeps its own selection (scene and position at each end) and draws it with decorations. Mouse drag, Shift+click and Shift+arrows across boundaries work; typing or Backspace over it deletes through the model. | Yes, both engines, mouse and keyboard. | **Touch is the gap.** The system selection handles are the browser's; I expect them to stop at the scene boundary on both phones, and nothing in the spike fixes that. Options: custom handles, a "extend selection to next scene" action, or accept selection within one scene on touch. Also not built: auto-scroll while dragging, formatting across a cross-scene selection, drag-and-drop of text, paste over it, joining the two ends after a delete. |
| Copy, select all | Copy and cut read the text from the model. Select all selects the project without mounting anything; copying all 300,000 words takes 7 to 19 ms. | Yes: the copied text equals the model text, 1.7 million characters. | Only plain text is put on the clipboard in the spike; rich text and paste are to do. |
| Undo | Each scene has its own history. | **No.** A join across two scenes is two edits in two histories; one undo reverts neither as a unit. | Needs a project-level undo stack that orders per-scene steps and groups cross-scene edits. With one Yjs document per scene the same question arises there. |
| Find | Searches the model (cached lower-case text per scene), shows the count, jumps to a match in an unmounted scene and highlights it. | Yes: 25,044 matches of "the", same count as an independent scan. | Browser find-in-page sees only the mounted scenes (3,832 of 300,000 words at the time of the check). The app must take over Ctrl/Cmd+F; Safari's "Find on Page" from the share sheet cannot be intercepted. Replace-all must run on the model. |
| Accessibility | Nothing beyond placeholders. | Not tested. | A screen reader can reach the mounted scenes only (about 3 to 5). Placeholders would need a label and a way to open them. Variants 1 and 2 expose the whole text. |

## 5. What variant 3's cross-scene work would cost

These are my estimates for one developer, not measured; the spike versions took a small part of one working session each but skip the hard cases named above.

| Work | Size | Note |
|---|---|---|
| Windowing core, placeholders, pinning, relayout on width change | 3 to 5 days | The spike version is about 250 lines and is the right shape. |
| Scroll anchoring that holds on iOS momentum scroll | 2 to 8 days | 2 if `scrollTop` writes or browser anchoring hold on the phone; up to 8 if slots must be absolutely positioned with re-basing at rest. |
| Keyboard movement across boundaries, all keys | 2 to 3 days | |
| Cross-scene selection: desktop complete (drag with auto-scroll, formatting, paste, delete with join) | 5 to 8 days | |
| Cross-scene selection on touch | 0 to 10 days | 0 if selection within one scene is accepted on touch for phase 1, with Select all and a "select scene" action; about 10 for custom handles. Decide after the phone test. |
| Project-level undo | 3 to 5 days | Shared with the storage design; needed anyway if one scene is one Yjs document. |
| Find and replace on the model, taking over the find shortcut | 2 to 3 days | The plan already has in-app find (PLAN §7). |
| Accessibility for unmounted scenes | 2 to 4 days | |
| **Total** | **about 4 to 9 weeks** | The spread is the two phone-dependent items. |

## 6. Manual checklist: not run

To run it: open the demo on each phone (iPhone: add to the Home Screen first and open it from there), press a variant, press **Load 300k words**. The **Checklist** button in the demo shows these steps. The grey lines under the buttons are the readout; **Reset stats** clears the typing numbers; **Auto-type** inserts 200 characters without the keyboard and reports the same typing numbers; **Slow scroll** and **Fling** run the scripted scroll tests on the phone and report shift, blank time and frame times.

Fill in per phone. Empty cells mean not tested.

| Item | V1 iPhone | V1 Android | V2 iPhone | V2 Android | V3 iPhone | V3 Android |
|---|---|---|---|---|---|---|
| Type a paragraph mid-project: lag, dropped characters | | | | | | |
| Autocorrect, dictation, swipe typing; Android non-Latin composition | | | | | | |
| Caret stays visible above the keyboard, page does not jump | | | | | | |
| Toolbar stays above the keyboard while scrolling and typing | | | | | | |
| Fling to the end and back: blank areas, position jumps | | | | | | |
| Jump to the last scene (Last) and type at once | | | | | | |
| Long-press, drag a handle across a scene boundary, copy, paste elsewhere | | | | | | |
| Leave for a minute, return: position kept | | | | | | |
| Readout: typing p50 / p95 / p99, jump ms, editors mounted, heap | | | | | | |
| V2 only, with `?v2fix=0`: after Last, does typed text land at the caret? | n/a | n/a | | | n/a | n/a |
| V3 only: Select all, Copy, paste elsewhere | n/a | n/a | n/a | n/a | | |
| V3 only, with `?anchor=native`: repeat the fling | n/a | n/a | n/a | n/a | | |

What I expect, to be confirmed or refuted:

- Variant 1 on Android: visible typing lag (same engine as the Chromium runs).
- Variant 2 on iPhone with `?v2fix=0`: text lands at the start of the next chapter.
- Variant 3 on both phones: selection handles stop at the scene boundary.
- Variant 3 on iPhone: the fling is the open question (see scroll anchoring above).

## 7. What cannot be verified without the phones

- Real keystroke latency with an on-screen keyboard, autocorrect, dictation and composition. Android composes almost all text input; ProseMirror has separate code paths for it that the automated typing does not use.
- iOS keyboard behaviour: the shell follows `visualViewport` so the toolbar sits above the keyboard and the caret is scrolled into view after the viewport changes. Untested on a device; the WebKit bugs in research §7 apply.
- iOS momentum scrolling with `scrollTop` corrections (variant 3) and with `content-visibility` size changes (variant 2).
- Selection handles across scenes (variant 3), and whether mounting or unmounting an editor during a touch selection disturbs it.
- Whether iOS reloads the page under memory pressure with variant 1's larger process, and whether the position comes back (the demo saves the position to `localStorage` and reopens there; edits are not stored).
- Compositor behaviour during a fling: blank or stale tiles are invisible to script.
- Spellcheck cost, named as a cause of lag in research §1: headless browsers have no dictionary.
- Heap on iOS: Safari has no heap API; the readout shows "n/a" there.

## 8. Budgets (PLAN §6): feedback

- **JavaScript heap at most 150 MB** does not discriminate: every variant is under 10 MB with the whole project in memory. The memory that differs is the renderer process (layout data), which the heap figure does not see. Suggest replacing it with a process-memory or "survives backgrounding without a reload" criterion, measured on the phone.
- **Keystroke latency** should say where the clock starts and stops. This spike used: key event timestamp to the first frame produced after the edit. On a 60 Hz phone that carries up to one refresh interval of waiting, so a 32 ms 95th percentile leaves about 15 ms for the work.
- **Jump at most 200 ms** and **search at most 150 ms** are met with a wide margin by every variant at 1x, and at 4x.
- **Cold open at most 1.5 s** cannot be judged here: the fixture is generated in memory in about 50 ms at 1x. With real storage, variants 1 and 2 must read all 600 scenes first; variant 3 needs only the scenes near the caret.

## 9. Dependencies and licences

All compatible with AGPL-3.0.

Shipped in the demo bundle:

| Package | Version | Licence |
|---|---|---|
| prosemirror-model | 1.25.13 | MIT |
| prosemirror-state | 1.4.4 | MIT |
| prosemirror-view | 1.42.9 | MIT |
| prosemirror-transform | 1.12.5 | MIT |
| prosemirror-keymap | 1.2.3 | MIT |
| prosemirror-commands | 1.7.2 | MIT |
| prosemirror-history | 1.5.1 | MIT |
| orderedmap (via prosemirror-model) | 2.1.1 | MIT |
| rope-sequence (via prosemirror-history) | 1.3.4 | MIT |
| w3c-keyname (via prosemirror-keymap) | 2.2.8 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| scheduler (via react-dom) | 0.28.0 | MIT |

Build and measurement only:

| Package | Version | Licence |
|---|---|---|
| vite | 8.3.8 | MIT |
| rolldown (via vite) | 1.2.18 | MIT |
| @vitejs/plugin-react | 6.3.0 | MIT |
| lightningcss (via vite) | 1.33.0 | MPL-2.0 |
| postcss (via vite) | 8.5.32 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| @types/react, @types/react-dom | 19.3.0 | MIT |
| playwright, playwright-core | 1.64.1 | Apache-2.0 |
| smaller transitive tools (picomatch, tinyglobby, fdir, nanoid, csstype, @oxc-project/types, @rolldown/pluginutils) | | MIT |
| picocolors | 1.1.1 | ISC |
| source-map-js | 1.2.2 | BSD-3-Clause |
| detect-libc | 2.1.2 | Apache-2.0 |

No Tiptap, no collaboration library, no storage.

## 10. How to run

```sh
cd spikes/a
bun install
bun run build          # production build into dist/
bun run serve          # serves dist/ on http://127.0.0.1:4317
```

Measurements (each starts its own static server on a free port; run one at a time):

```sh
node measure/functional.mjs chromium     # cross-scene behaviour checks; also: webkit
node measure/run.mjs chromium 4          # all measurements, Chromium, CPU 4x; also: chromium 1, webkit 1
./measure/run-all.sh                     # the three configurations in sequence, about 30 minutes
node measure/report.mjs results          # the tables in section 3 from spikes/a/results/*.json
node measure/profile-typing.mjs 1 100    # per-keystroke CPU breakdown, Chromium
DPR=1 node measure/webkit-tail.mjs 3      # WebKit slow keystrokes at a given device pixel ratio
```

Page options: `?v=1|2|3`, `&autoload=1` (load at once), `&fresh=1` (ignore the saved position), `&anchor=native|off` (variant 3 scroll anchoring), `&overscan=N` (screens kept mounted, default 2), `&v2fix=0` (variant 2 without the WebKit selection repair).

Side effects on the build host, outside the repository:

- `playwright install webkit` downloaded WebKit build 2370 into the shared Playwright cache, and Playwright's own clean-up removed browser builds that no installed project referenced any more (`chromium-1243`, `chromium_headless_shell-1243`, `webkit-2359`). A project that needs them gets them back with its own `playwright install`.
- Three library files are linked into `~/.cache/ms-playwright/webkit-2370/minibrowser-wpe/sys/lib/` from `~/.cache/spike-a-webkit-libs/`. Removing either directory undoes it.
