// Extract text lines with positions from a PDF using poppler's pdftotext -bbox-layout.
// Returns, per page, the lines (x and y in points from the top-left, text).

export interface PdfLine { x: number; y: number; text: string }
export interface PdfPage { lines: PdfLine[] }

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&')

export async function pdfLines(path: string): Promise<PdfPage[]> {
  const proc = Bun.spawn(['pdftotext', '-bbox-layout', path, '-'], { stdout: 'pipe', stderr: 'pipe' })
  const html = await new Response(proc.stdout).text()
  await proc.exited
  const pages: PdfPage[] = []
  for (const pm of html.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)) {
    const words: { x: number; y: number; x2: number; t: string }[] = []
    for (const wm of pm[1].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g)) {
      words.push({ x: +wm[1], y: +wm[2], x2: +wm[3], t: decode(wm[5]) })
    }
    // group words into rows by y (within 3 pt), then sort by x
    words.sort((a, b) => a.y - b.y || a.x - b.x)
    const rows: { y: number; ws: typeof words }[] = []
    for (const w of words) {
      const r = rows.find((r) => Math.abs(r.y - w.y) < 3)
      if (r) r.ws.push(w)
      else rows.push({ y: w.y, ws: [w] })
    }
    const lines: PdfLine[] = rows
      .map((r) => {
        r.ws.sort((a, b) => a.x - b.x)
        // keep wide gaps (dual columns, transitions) as two spaces so they stay visible
        let text = ''
        let prevX2 = -1
        for (const w of r.ws) {
          if (prevX2 >= 0) text += w.x - prevX2 > 30 ? '  ' : ' '
          text += w.t
          prevX2 = w.x2
        }
        return { x: r.ws[0].x, y: r.y, text }
      })
      .sort((a, b) => a.y - b.y)
    pages.push({ lines })
  }
  return pages
}
