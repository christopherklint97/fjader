// Shared helpers for the Playwright runs: a static server for dist/ and browser setup.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
export const distDir = path.resolve(here, '../dist')
export const outDir = path.resolve(here, 'out')

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json' }

export function serveDist() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x')
      let file = path.join(distDir, decodeURIComponent(url.pathname))
      if (file.endsWith(path.sep) || !path.extname(file)) file = path.join(distDir, 'index.html')
      fs.readFile(file, (error, data) => {
        if (error) {
          res.writeHead(404)
          res.end('not found')
          return
        }
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
        res.end(data)
      })
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }))
  })
}

// Phone-sized viewport. DPR 2 keeps software rasterisation on this host from
// dominating; text layout only depends on the CSS width.
export const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: Number(process.env.DPR ?? 2),
  hasTouch: true,
}

export async function launch(browserName) {
  if (browserName === 'webkit') return webkit.launch()
  return chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] })
}

/** Opens a page. `throttle` is the Chromium CPU slowdown factor (1 = none). */
export async function openPage(browser, browserName, { throttle = 1, mobile = true } = {}) {
  const context = await browser.newContext({
    ...PHONE,
    ...(browserName === 'chromium' && mobile ? { isMobile: true } : {}),
  })
  const page = await context.newPage()
  let cdp = null
  if (browserName === 'chromium') {
    cdp = await context.newCDPSession(page)
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  }
  page.on('pageerror', (error) => console.error('[pageerror]', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('[console]', message.text())
  })
  return { context, page, cdp }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function loadAverage() {
  try {
    return fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).map(Number)
  } catch {
    return null
  }
}
