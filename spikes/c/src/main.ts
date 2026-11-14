// Spike C demo: pages drawn from the paginator's layout (the same rows the PDF gets), editing by
// tapping a line, pagination and PDF in workers. Throwaway code.
import './style.css'
import { parseFountain, toElementModel } from './load/fountain'
import { parseFdx } from './load/fdx'
import { generateStress } from './fixtures/stress'
import { rulesSample } from './fixtures/rules-sample'
import { profiles } from './paginator/profiles'
import { paginate } from './paginator/paginate'
import { LivePaginator } from './paginator/incremental'
import type { Element } from './paginator/types'
import type { FromPaginator, FromPdf, RenderPage } from './worker/protocol'

// the screen uses the same font file the PDF embeds
const face = new FontFace('Courier Prime', `url(${new URL('./fonts/CourierPrime-Regular.ttf', document.baseURI).href})`)
document.fonts.add(face)
void face.load()

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const pagesEl = $('pages')
const statusEl = $('status')
const editor = $('editor')
const edText = $<HTMLTextAreaElement>('ed-text')
const edLabel = $('ed-label')

const pagWorker = new Worker(new URL('./worker/paginate.worker.ts', import.meta.url), { type: 'module' })
const pdfWorker = new Worker(new URL('./worker/pdf.worker.ts', import.meta.url), { type: 'module' })
const channel = new MessageChannel()
pagWorker.postMessage({ type: 'port', port: channel.port1 }, [channel.port1])
pdfWorker.postMessage({ type: 'port', port: channel.port2 }, [channel.port2])
fetch('./fonts/CourierPrime-Regular.ttf')
  .then((r) => r.arrayBuffer())
  .then((font) => pdfWorker.postMessage({ type: 'font', font }, [font]))

// ---- state and measurements (exposed for the automated runs) --------------------------------
let elements: Element[] = []
let profileName = 'us-feature'
let pageCount = 0
let editing = -1
let seq = 0
const sentAt = new Map<number, number>()
const m = {
  fullMs: [] as number[],
  repaginateMs: [] as number[],
  updates: [] as { seq: number; ms: number; roundTrip: number; coalesced: number; recomputed: number; resynced: boolean; fromPage: number; pages: number }[],
  inputToFrame: [] as number[],
  handlerMs: [] as number[],
  inputHandlerMs: [] as number[],
  pdf: [] as { ms: number; totalMs: number; bytes: number; pages: number; cloneMs?: number }[],
  pageCount: () => pageCount,
}
;(window as unknown as { __spike: unknown }).__spike = {
  m,
  load: (sample: string, profile: string) => load(sample, profile),
  edit: (index: number) => openEditor(index),
  elementCount: () => elements.length,
  /** Index of the first dialogue or action element at or after position `i`. */
  findEditable: (i: number) => {
    for (let j = i; j < elements.length; j++) if (elements[j].type === 'dialogue' || elements[j].type === 'action') return j
    return i
  },
  exportPdf: () => exportPdf(),
  repaginate: () => pagWorker.postMessage({ type: 'repaginate' }),
  // Measurement only: the same code on the main thread, where Chromium's CPU throttling applies
  // (DevTools throttling does not slow down workers).
  bench: async (sample: string, runs: number, withPdf: boolean) => {
    const els = toElementModel(parseFountain(sample === 'stress-500' ? generateStress(500, 7) : generateStress(120, 7)))
    const prof = profiles['us-feature']
    const full: number[] = []
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now()
      paginate(els, prof)
      full.push(performance.now() - t0)
    }
    const live = new LivePaginator(els, prof)
    const edits: Record<string, number[]> = {}
    for (const [where, frac] of [['start', 0.02], ['middle', 0.5], ['end', 0.97]] as const) {
      let idx = Math.floor(els.length * frac)
      while (live.elements[idx].type !== 'dialogue' && live.elements[idx].type !== 'action') idx++
      edits[where] = []
      let text = live.elements[idx].text
      for (const ch of ' and then she said something new.') {
        text += ch
        const t0 = performance.now()
        live.editText(idx, text)
        edits[where].push(performance.now() - t0)
      }
    }
    let pdfMs: number[] = []
    if (withPdf) {
      const { writePdf } = await import('./pdf/writer')
      const font = await (await fetch('./fonts/CourierPrime-Regular.ttf')).arrayBuffer()
      const pages = live.res.pages
      for (let i = 0; i < 2; i++) pdfMs.push((await writePdf(pages, prof, font)).ms)
    }
    return { pages: live.res.pages.length, full, edits, pdfMs }
  },
}

const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN)
const p95 = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.95))] : NaN)
const f = (n: number) => (Number.isFinite(n) ? n.toFixed(n < 10 ? 1 : 0) : '-')

function showStatus() {
  const u = m.updates.slice(-50)
  const parts = [
    `${pageCount} pages`,
    `full ${f(m.fullMs[m.fullMs.length - 1])} ms`,
    u.length ? `update ${f(u[u.length - 1].ms)} ms (median ${f(median(u.map((x) => x.ms)))}, round trip ${f(median(u.map((x) => x.roundTrip)))})` : '',
    m.inputToFrame.length ? `input→frame p50 ${f(median(m.inputToFrame.slice(-50)))} p95 ${f(p95(m.inputToFrame.slice(-50)))} ms` : '',
    m.pdf.length ? `PDF ${f(m.pdf[m.pdf.length - 1].totalMs)} ms, ${(m.pdf[m.pdf.length - 1].bytes / 1024).toFixed(0)} KB` : '',
  ]
  statusEl.textContent = parts.filter(Boolean).join(' · ')
}

// ---- page rendering ------------------------------------------------------------------------
// 1 unit = one character width; the page is 85 x 110 units at 10 characters per inch.
function pageDiv(i: number, rp: RenderPage): HTMLDivElement {
  const prof = profiles[profileName]
  const div = document.createElement('div')
  div.className = 'page'
  div.dataset.n = String(i)
  const html: string[] = []
  const pos = (lines: number, cells: number) => `top:calc(${lines.toFixed(3)} * var(--lh));left:calc(${cells.toFixed(2)} * var(--u))`
  if (i > 0) {
    const num = `${i + 1}.`
    html.push(`<div class="row num" style="${pos(prof.pageNumberTop * 6, (prof.pageNumberRight - num.length * prof.charWidth) * 10)}">${num}</div>`)
  }
  for (const [row, x, text, e, kind] of rp.rows) {
    const top = prof.topMargin * 6 + row * (prof.lineHeight * 6)
    html.push(`<div class="row k-${kind}${e === editing ? ' on' : ''}" data-e="${e}" style="${pos(top, x * 10)}">${esc(text)}</div>`)
  }
  div.innerHTML = html.join('')
  return div
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function renderAll(pages: RenderPage[]) {
  const frag = document.createDocumentFragment()
  pages.forEach((rp, i) => frag.appendChild(pageDiv(i, rp)))
  pagesEl.replaceChildren(frag)
}

const params = new URLSearchParams(location.search)
function applyChanges(changed: [number, RenderPage][], count: number) {
  if (params.has('noapply')) return
  const existing = pagesEl.children
  for (const [i, rp] of changed) {
    const div = pageDiv(i, rp)
    if (i < existing.length) {
      if (params.has('inplace')) existing[i].innerHTML = div.innerHTML
      else pagesEl.replaceChild(div, existing[i])
    } else pagesEl.appendChild(div)
  }
  while (pagesEl.children.length > count) pagesEl.lastChild!.remove()
}

pagWorker.onmessage = (ev: MessageEvent<FromPaginator>) => {
  const h0 = performance.now()
  handle(ev)
  m.handlerMs.push(performance.now() - h0)
}
function handle(ev: MessageEvent<FromPaginator>) {
  const msg = ev.data
  if (msg.type === 'full') {
    pageCount = msg.pageCount
    m.fullMs.push(msg.ms)
    renderAll(msg.pages)
  } else if (msg.type === 'update') {
    pageCount = msg.pageCount
    const t = sentAt.get(msg.seq)
    m.updates.push({ seq: msg.seq, ms: msg.ms, roundTrip: t !== undefined ? performance.now() - t : NaN, coalesced: msg.coalesced, recomputed: msg.recomputed, resynced: msg.resynced, fromPage: msg.fromPage, pages: msg.pageCount })
    applyChanges(msg.changed, msg.pageCount)
  } else if (msg.type === 'repaginated') {
    m.repaginateMs.push(msg.ms)
    m.fullMs.push(msg.ms)
  } else if (msg.type === 'exporting') {
    pdfStart.cloneMs = msg.cloneMs
  }
  showStatus()
}

// ---- PDF ----------------------------------------------------------------------------------------
let pdfStart = { t: 0, cloneMs: 0 }
let lastUrl = ''
function exportPdf() {
  pdfStart = { t: performance.now(), cloneMs: 0 }
  statusEl.textContent = 'Writing PDF…'
  pagWorker.postMessage({ type: 'export' })
}
pdfWorker.onmessage = (ev: MessageEvent<FromPdf>) => {
  const msg = ev.data
  if (msg.type === 'pdf-error') {
    statusEl.textContent = 'PDF failed: ' + msg.message
    return
  }
  m.pdf.push({ ms: msg.ms, totalMs: performance.now() - pdfStart.t, bytes: msg.bytes.length, pages: msg.pages, cloneMs: pdfStart.cloneMs })
  if (lastUrl) URL.revokeObjectURL(lastUrl)
  lastUrl = URL.createObjectURL(new Blob([msg.bytes as BlobPart], { type: 'application/pdf' }))
  const a = $<HTMLAnchorElement>('dl')
  a.href = lastUrl
  a.download = 'spike-c.pdf'
  a.hidden = false
  showStatus()
}

// ---- loading ------------------------------------------------------------------------------------
function load(sample: string, profile: string, text?: string) {
  profileName = profile
  let src = text
  if (src === undefined) src = sample === 'stress-120' ? generateStress(120, 7) : sample === 'stress-500' ? generateStress(500, 7) : rulesSample
  if (/<FinalDraft/.test(src)) elements = parseFdx(src)
  else {
    const tokens = parseFountain(src)
    elements = profile === 'afterwriting-usletter' ? tokens : toElementModel(tokens)
  }
  closeEditor()
  m.updates.length = 0
  statusEl.textContent = 'Paginating…'
  pagWorker.postMessage({ type: 'load', elements, profile })
}

$('load').onclick = () => load(($('sample') as HTMLSelectElement).value, ($('profile') as HTMLSelectElement).value)
$('full').onclick = () => pagWorker.postMessage({ type: 'repaginate' })
$('pdf').onclick = exportPdf
$<HTMLInputElement>('file').onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) load('file', ($('profile') as HTMLSelectElement).value, await file.text())
}
const dlg = $<HTMLDialogElement>('paste-dlg')
$('paste').onclick = () => dlg.showModal()
dlg.onclose = () => {
  if (dlg.returnValue === 'ok') load('paste', ($('profile') as HTMLSelectElement).value, $<HTMLTextAreaElement>('paste-text').value)
}

// ---- editing ------------------------------------------------------------------------------------
pagesEl.addEventListener('click', (e) => {
  const row = (e.target as HTMLElement).closest('.row') as HTMLElement | null
  if (!row || row.dataset.e === undefined) return
  const idx = Number(row.dataset.e)
  if (idx >= 0) openEditor(idx)
})

function mark(idx: number, on: boolean) {
  for (const r of pagesEl.querySelectorAll(`.row[data-e="${idx}"]`)) r.classList.toggle('on', on)
}
function openEditor(idx: number) {
  if (editing >= 0) mark(editing, false)
  editing = idx
  mark(idx, true)
  const el = elements[idx]
  edLabel.textContent = `#${idx} ${el.type.replace('_', ' ')}${el.dual ? ' (' + el.dual + ')' : ''}`
  edText.value = el.text
  editor.hidden = false
  edText.focus({ preventScroll: true })
}
function closeEditor() {
  if (editing >= 0) mark(editing, false)
  editing = -1
  editor.hidden = true
}
$('ed-close').onclick = closeEditor
$('ed-prev').onclick = () => editing > 0 && openEditor(editing - 1)
$('ed-next').onclick = () => editing < elements.length - 1 && openEditor(editing + 1)

edText.addEventListener('input', (e) => {
  if (editing < 0) return
  const i0 = performance.now()
  const text = edText.value
  elements[editing] = { ...elements[editing], text }
  seq++
  sentAt.set(seq, performance.now())
  if (!params.has('nopost')) pagWorker.postMessage({ type: 'edit', index: editing, text, seq })
  // keystroke cost on the main thread: input event to the next frame
  const ts = e.timeStamp
  m.inputHandlerMs.push(performance.now() - i0)
  requestAnimationFrame(() => setTimeout(() => {
    m.inputToFrame.push(performance.now() - ts)
  }, 0))
})

for (const k of ['nocv', 'noshadow', 'static']) if (params.has(k)) document.body.classList.add(k)
load(params.get('sample') ?? 'stress-120', params.get('profile') ?? 'us-feature')
