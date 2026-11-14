/// <reference lib="webworker" />
// Pagination worker: owns the elements and the live paginator; answers edits with the pages that changed.
import { LivePaginator } from '../paginator/incremental'
import { pageItems } from '../paginator/layout'
import { now, paginate } from '../paginator/paginate'
import { profiles } from '../paginator/profiles'
import type { Page, Profile } from '../paginator/types'
import type { FromPaginator, RenderPage, ToPaginator } from './protocol'

let live: LivePaginator | null = null
let profile: Profile = profiles['us-feature']
let pdfPort: MessagePort | null = null
const post = (m: FromPaginator) => (self as unknown as Worker).postMessage(m)

function renderWithElements(pg: Page): RenderPage {
  // element index per row, so a tap on a row opens the right element
  const rows: RenderPage['rows'] = []
  const shift = pg.start.carry && profile.contdInMargin ? -1 : 0
  const items = pageItems(pg, profile)
  for (const it of items) {
    const line = pg.lines[it.row - shift]
    rows.push([it.row, it.x, it.text, line ? line.e : -1, it.kind])
  }
  return { rows }
}

// edits are coalesced: while one is being paginated, later ones for the same element replace earlier ones
let sigs: string[] = []
let pending: { index: number; text: string; seq: number }[] = []
let scheduled = false

function flush() {
  scheduled = false
  if (!live || !pending.length) return
  const batch = pending
  pending = []
  // apply all but the last directly (only the text matters), paginate once
  const last = batch[batch.length - 1]
  for (const e of batch.slice(0, -1)) live.elements[e.index] = { ...live.elements[e.index], text: e.text }
  const before = live.res.pages
  const t0 = now()
  const st = batch.length > 1 && batch.some((b) => b.index !== last.index) ? live.reset(live.elements) : live.editText(last.index, last.text)
  const ms = now() - t0
  const after = live.res.pages
  const changed: [number, RenderPage][] = []
  for (let i = 0; i < after.length; i++) {
    if (before[i]?.lines === after[i].lines) continue
    // re-computed pages often come out the same: send only pages whose rows differ
    const rp = renderWithElements(after[i])
    const sig = JSON.stringify(rp.rows)
    if (sigs[i] === sig) continue
    sigs[i] = sig
    changed.push([i, rp])
  }
  sigs.length = after.length
  post({ type: 'update', seq: last.seq, pageCount: after.length, ms, coalesced: batch.length, fromPage: st.fromPage, recomputed: st.recomputed, resynced: st.resynced, changed })
}

self.onmessage = (ev: MessageEvent<ToPaginator>) => {
  const m = ev.data
  if (m.type === 'port') {
    pdfPort = m.port
  } else if (m.type === 'load') {
    profile = profiles[m.profile] ?? profiles['us-feature']
    const t0 = now()
    live = new LivePaginator(m.elements, profile)
    const ms = now() - t0
    const pages = live.res.pages.map(renderWithElements)
    sigs = pages.map((rp) => JSON.stringify(rp.rows))
    post({ type: 'full', pageCount: live.res.pages.length, ms, pages })
  } else if (m.type === 'edit') {
    pending.push({ index: m.index, text: m.text, seq: m.seq })
    if (!scheduled) {
      scheduled = true
      setTimeout(flush, 0)
    }
  } else if (m.type === 'repaginate' && live) {
    const t0 = now()
    const r = paginate(live.elements, profile)
    post({ type: 'repaginated', ms: now() - t0, pageCount: r.pages.length })
  } else if (m.type === 'export' && live && pdfPort) {
    const t0 = now()
    // send only what the writer needs: the pages' lines (structured clone)
    const pages = live.res.pages.map((pg) => ({ lines: pg.lines, start: { cursor: pg.start.cursor, carry: pg.start.carry, rest: null } }))
    pdfPort.postMessage({ pages, profile: profile.name })
    post({ type: 'exporting', pages: pages.length, cloneMs: now() - t0 })
  }
}
