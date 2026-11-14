// PDF writer: draws the paginator's pages with PDFKit and an embedded Courier Prime. It places
// every line where layout.ts says; nothing is re-flowed (lineBreak: false on every call).

import PDFDocument from 'pdfkit'
import { pageItems } from '../paginator/layout'
import type { Page, Profile } from '../paginator/types'

export interface PdfResult {
  bytes: Uint8Array
  ms: number
  pages: number
}

export function writePdf(pages: Page[], p: Profile, font: ArrayBuffer | Uint8Array, title = 'Script'): Promise<PdfResult> {
  const t0 = performance.now()
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [p.pageWidth * 72, p.pageHeight * 72],
      margins: { top: 0, left: 0, bottom: 0, right: 0 },
      // our font is the default font, so PDFKit never loads its built-in Helvetica
      font: font as unknown as string,
      autoFirstPage: false,
      compress: true,
      info: { Title: title, Creator: 'Fjäder spike C' },
    })
    const chunks: Uint8Array[] = []
    doc.on('data', (c: Uint8Array) => chunks.push(c))
    doc.on('error', reject)
    doc.on('end', () => {
      let n = 0
      for (const c of chunks) n += c.length
      const bytes = new Uint8Array(n)
      let o = 0
      for (const c of chunks) { bytes.set(c, o); o += c.length }
      resolve({ bytes, ms: performance.now() - t0, pages: pages.length })
    })
    doc.fontSize(p.fontSize)
    const opts = { lineBreak: false }
    pages.forEach((page, i) => {
      doc.addPage()
      if (i > 0) {
        const num = `${i + 1}.`
        doc.text(num, (p.pageNumberRight - num.length * p.charWidth) * 72, p.pageNumberTop * 72, opts)
      }
      for (const it of pageItems(page, p)) {
        doc.text(it.text, it.x * 72, (p.topMargin + it.row * p.lineHeight) * 72, opts)
      }
    })
    doc.end()
  })
}
