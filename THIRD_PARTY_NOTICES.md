# Third-party notices

Fjäder is licensed under AGPL-3.0 (see `LICENSE`). This repository also contains, or is derived in part from, the third-party material below. Packages installed from npm are not part of the repository; each spike's findings file in `docs/spikes/results/` lists its dependencies and their licences.

## Ported code

| Item | Where in this repository | Source | Licence |
|---|---|---|---|
| afterwriting liner (`split_text`, `default_breaker`, `break_lines`, `fold_dual_dialogue`, `line`) | `spikes/c/src/paginator/wrap.ts`, `spikes/c/src/paginator/paginate.ts` (rule set `afterwriting`) | [afterwriting-labs](https://github.com/ifrost/afterwriting-labs), `js/utils/liner.js`, commit `f1912c08d0905bac42e1805830a1e72f98b88c2f` | MIT, Copyright (c) 2015-2020 Piotr Jamróz |
| afterwriting "usletter" print profile | `spikes/c/src/paginator/profiles.ts` (`afterwritingUsLetter`) | afterwriting-labs `js/utils/print-profiles.js`, same commit | MIT, Copyright (c) 2015-2020 Piotr Jamróz |
| afterwriting dual-dialogue placement | `spikes/c/src/paginator/layout.ts` | afterwriting-labs `js/utils/pdfmaker.js`, same commit | MIT, Copyright (c) 2015-2020 Piotr Jamróz |
| aw-parser Fountain parser | `spikes/c/src/load/fountain.ts` | npm `aw-parser@0.1.1`, `parser.js` (the parser afterwriting 1.17.3 uses) | MIT, Copyright (c) 2017 aw-parser |

betterfountain (`src/pdf/liner.ts`, MIT, commit `4f109ec1`) was read and compared with afterwriting's liner during spike C; no code was taken from it.

## Bundled fonts

| Item | Where in this repository | Source | Licence |
|---|---|---|---|
| Courier Prime Regular (2015 release) | `spikes/c/public/fonts/CourierPrime-Regular.ttf` | google/fonts `ofl/courierprime`; Copyright 2015 The Courier Prime Project Authors (https://github.com/quoteunquoteapps/CourierPrime) | SIL Open Font License 1.1, full text in `spikes/c/public/fonts/OFL.txt` |

## Reference material that is not included

`spikes/c/tools/fetch-refs.sh` downloads reference scripts into `spikes/c/reference/in/`, which is not committed: fountain.io's sample scripts (Big Fish, Brick & Steel, The Last Birthday Card) as Fountain, FDX and Final Draft PDF; afterwriting's sample and test scripts (MIT); and the Academy Nicholl formatting sample PDF. These remain the property of their authors and are not distributed with this repository.

## MIT licence text

The following applies to the afterwriting-labs and aw-parser code listed above, with the copyright lines given there.

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
