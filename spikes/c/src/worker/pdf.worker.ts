/// <reference lib="webworker" />
// PDF worker: receives the paginator's pages over a MessagePort and draws them with PDFKit.
import { writePdf } from '../pdf/writer'
import { profiles } from '../paginator/profiles'
import type { Page } from '../paginator/types'
import type { FromPdf } from './protocol'

let font: ArrayBuffer | null = null
const post = (m: FromPdf, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer)

self.onmessage = (ev: MessageEvent<{ type: 'font'; font: ArrayBuffer } | { type: 'port'; port: MessagePort }>) => {
  const m = ev.data
  if (m.type === 'font') font = m.font
  else if (m.type === 'port') {
    m.port.onmessage = async (e: MessageEvent<{ pages: Page[]; profile: string }>) => {
      try {
        if (!font) throw new Error('font not loaded')
        const r = await writePdf(e.data.pages, profiles[e.data.profile], font)
        post({ type: 'pdf', bytes: r.bytes, ms: r.ms, pages: r.pages }, [r.bytes.buffer])
      } catch (err) {
        post({ type: 'pdf-error', message: String(err) })
      }
    }
  }
}
