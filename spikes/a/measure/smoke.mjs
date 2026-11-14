import { serveDist, launch, openPage, sleep } from './lib.mjs'
const browserName = process.argv[2] ?? 'chromium'
const { server, origin } = await serveDist()
const browser = await launch(browserName)
try {
  for (const v of (process.argv[3] ?? '3,2,1').split(',')) {
    const { context, page } = await openPage(browser, browserName)
    const t = Date.now()
    await page.goto(`${origin}/?v=${v}&autoload=1&fresh=1`)
    await page.waitForFunction(() => window.__spike?.lastLoad, null, { timeout: 180000 })
    const snap = await page.evaluate(() => window.__spike.snapshot())
    console.log(browserName, 'variant', v, 'wall', Date.now() - t, JSON.stringify(snap.load), 'mounted', snap.mounted, 'dom', JSON.stringify(snap.dom), 'heap', snap.heapMB, 'features', snap.overflowAnchor, snap.contentVisibility, snap.hasEventTiming)
    console.log('  debug', JSON.stringify(snap.debug))
    await page.keyboard.type('Hello world ', { delay: 40 })
    await sleep(300)
    const after = await page.evaluate(() => ({ typing: window.__spike.latency.summary(), text: window.__spike.controller.sceneText(window.__spike.project.midScene).includes('Hello world ') }))
    console.log('  typed', JSON.stringify(after))
    await page.screenshot({ path: `measure/out/smoke-${browserName}-v${v}.png` })
    await context.close()
  }
} finally {
  await browser.close()
  server.close()
}
