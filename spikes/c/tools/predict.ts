// Predictions for the owner's manual Final Draft check: page counts and the first line of each page.
//   bun run tools/predict.ts > reference/results/predicted-for-final-draft.txt
import { readFileSync, existsSync } from 'node:fs'
import { parseFountain, toElementModel } from '../src/load/fountain'
import { parseFdx, profileFromFdx } from '../src/load/fdx'
import { paginate } from '../src/paginator/paginate'
import { pageRows } from '../src/paginator/layout'
import { usFeature } from '../src/paginator/profiles'
import { generateStress } from '../src/fixtures/stress'
import type { Element, Profile } from '../src/paginator/types'

function show(title: string, els: Element[], p: Profile, firstLines: boolean) {
  const r = paginate(els, p)
  console.log(`\n${title}: ${r.pages.length} pages (profile ${p.name}, ${(72 * p.charWidth).toFixed(3)} pt pitch, ${p.linesPerPage} lines)`)
  if (firstLines) r.pages.forEach((pg, i) => {
    const rows = pageRows(pg, p).filter((x) => x.row >= 0)
    console.log(`  p${i + 1}: ${rows[0]?.text.trim() ?? ''}`)
  })
}
const IN = 'reference/in'
console.log('Fountain files opened in Final Draft (File > Open, Fountain), default US screenplay template. Our us-feature profile:')
for (const n of ['brick-and-steel', 'the-last-birthday-card', 'big-fish']) {
  if (existsSync(`${IN}/${n}.fountain`)) show(`${n}.fountain`, toElementModel(parseFountain(readFileSync(`${IN}/${n}.fountain`, 'utf8'))), usFeature, n !== 'big-fish')
}
show('stress-120.fountain (spikes/c: bun run src/fixtures/stress.ts 120 7)', toElementModel(parseFountain(generateStress(120, 7))), usFeature, false)
console.log('\nFDX files from fountain.io opened in Final Draft (their own settings). Final Draft 8 gave 4, 20 and 120 script pages.')
for (const n of ['brick-and-steel', 'the-last-birthday-card', 'big-fish']) {
  if (!existsSync(`${IN}/${n}.fdx`)) continue
  const x = readFileSync(`${IN}/${n}.fdx`, 'utf8')
  show(`${n}.fdx`, parseFdx(x), profileFromFdx(x, 'fdx-own-settings', {}, 6.995), n === 'the-last-birthday-card')
}
