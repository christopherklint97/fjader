// Check a PDF that the browser build wrote (measure/out/browser-<browser>.pdf, saved by measure/smoke.mjs)
// against the paginator's pages for the same script (stress-120, us-feature).
import { parseFountain, toElementModel } from '../src/load/fountain'
import { paginate } from '../src/paginator/paginate'
import { usFeature } from '../src/paginator/profiles'
import { generateStress } from '../src/fixtures/stress'
import { verifyPdf } from './pdf-check'
const file = process.argv[2]
const res = paginate(toElementModel(parseFountain(generateStress(120, 7))), usFeature)
const v = await verifyPdf(file, res.pages, usFeature)
const fonts = Bun.spawnSync(['pdffonts', file]).stdout.toString().split('\n').slice(2).filter(Boolean)
console.log(JSON.stringify({ file, pages: res.pages.length, ...v, fonts }))
