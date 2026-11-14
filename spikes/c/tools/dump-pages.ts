// Debug: print our pages and the reference PDF pages side by side (rows only).
import { readFileSync } from 'node:fs'
import { parseFountain } from '../src/load/fountain'
import { parseFdx, profileFromFdx } from '../src/load/fdx'
import { paginate } from '../src/paginator/paginate'
import { pageRows } from '../src/paginator/layout'
import { afterwritingUsLetter } from '../src/paginator/profiles'
import { pdfLines } from './pdflines'
const [mode, name, from, to] = process.argv.slice(2)
const fd = mode === 'fd'
const src = readFileSync(`reference/in/${name}.${fd ? 'fdx' : 'fountain'}`, 'utf8')
const p = fd ? profileFromFdx(src, 'fd', {}, 6.995) : afterwritingUsLetter
const els = fd ? parseFdx(src) : parseFountain(src)
const res = paginate(els, p)
const ref = await pdfLines(fd ? `reference/in/${name}.fd.pdf` : `reference/out/${name}.aw.pdf`)
const off = Number(process.argv[6] ?? 0)
for (let k = +from; k <= +to; k++) {
  console.log(`===== page ${k} ours`)
  const pg = res.pages[k - 1]
  if (pg) for (const r of pageRows(pg, p)) console.log(String(r.row).padStart(2), r.kinds.join(',').padEnd(14), r.text)
  console.log(`----- page ${k + off} ref`)
  const rp = ref[k - 1 + off]
  if (rp) for (const l of rp.lines) console.log(((l.y / 72 - p.topMargin) * 6).toFixed(1).padStart(5), (l.x / 72).toFixed(2), l.text)
}
