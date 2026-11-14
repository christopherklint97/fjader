// Functional checks for the parts of variant 3 that a single editor gets for free:
// keys, selection and copy across scene boundaries, select-all, find, pinning.
// Also records the WebKit content-visibility selection bug in variant 2.
// Usage: node measure/functional.mjs [chromium|webkit]
import fs from 'node:fs'
import path from 'node:path'
import { serveDist, launch, openPage, sleep, outDir } from './lib.mjs'

const browserName = process.argv[2] ?? 'chromium'
const mod = 'Control'
const { server, origin } = await serveDist()
const browser = await launch(browserName)
const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

async function open(query) {
  const { context, page, cdp } = await openPage(browser, browserName, { mobile: false })
  await page.goto(`${origin}/?${query}&autoload=1&fresh=1`)
  await page.waitForFunction(() => window.__spike?.lastLoad, null, { timeout: 180000 })
  await sleep(200)
  // Capture what a copy puts on the clipboard without needing clipboard permissions.
  await page.evaluate(() => {
    window.__copied = null
    document.addEventListener('copy', (event) => {
      window.__copied = event.clipboardData.getData('text/plain')
    })
  })
  return { context, page, cdp }
}

const state = (page) =>
  page.evaluate(() => {
    const c = window.__spike.controller
    const view = c.activeView()
    return {
      focused: c.focused,
      head: view ? view.state.selection.head : null,
      anchor: view ? view.state.selection.anchor : null,
      size: view ? view.state.doc.content.size : null,
      mounted: [...c.views.keys()].sort((a, b) => a - b),
      cross: c.cross,
      domFocusScene: document.activeElement?.dataset?.scene ?? null,
    }
  })

/** Scrolls so the boundary between scene k and k+1 is in the middle of the viewport. */
const centreBoundary = (page, k) =>
  page.evaluate(async (k) => {
    const s = window.__spike
    const c = s.controller
    for (let i = 0; i < 4; i++) {
      s.scroller.scrollTop = c.slots[k + 1].offsetTop - s.scroller.clientHeight / 2
      c.update()
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)))
    }
    const rect = c.slots[k + 1].getBoundingClientRect()
    const sr = s.scroller.getBoundingClientRect()
    return { boundaryY: rect.top, left: rect.left, width: rect.width, top: sr.top, bottom: sr.bottom }
  }, k)

try {
  // ------------------------------------------------------------------ variant 3
  {
    const { context, page, cdp } = await open('v=3')
    const K = 120 // a boundary inside a chapter is not required; any scene pair works

    // Arrow keys
    await page.evaluate((k) => window.__spike.jump(k, 1e9), K) // caret at the end of scene K
    let s = await state(page)
    record('jump puts the caret at the end of the scene', s.focused === K && s.head === s.size - 1, JSON.stringify({ focused: s.focused, head: s.head, size: s.size }))
    await page.keyboard.press('ArrowRight')
    s = await state(page)
    record('ArrowRight at scene end moves to the next scene start', s.focused === K + 1 && s.head === 1 && s.domFocusScene === String(K + 1), JSON.stringify(s))
    await page.keyboard.press('ArrowLeft')
    s = await state(page)
    record('ArrowLeft at scene start moves to the previous scene end', s.focused === K && s.head === s.size - 1, JSON.stringify({ focused: s.focused, head: s.head, size: s.size }))
    await page.keyboard.press('ArrowDown')
    s = await state(page)
    record('ArrowDown on the last line moves into the next scene', s.focused === K + 1 && s.head >= 1 && s.head < 200, JSON.stringify({ focused: s.focused, head: s.head }))
    await page.keyboard.press('ArrowUp')
    s = await state(page)
    record('ArrowUp on the first line moves into the previous scene', s.focused === K, JSON.stringify({ focused: s.focused, head: s.head, size: s.size }))
    await page.keyboard.type('XY')
    const typed = await page.evaluate((k) => window.__spike.controller.sceneText(k), K)
    record('typing after crossing lands in the scene that has the caret', typed.includes('XY'), '')

    // Backspace at the start of a scene
    const before = await page.evaluate((k) => {
      const c = window.__spike.controller
      return { prev: c.sceneText(k), cur: c.sceneText(k + 1) }
    }, K)
    await page.evaluate((k) => window.__spike.jump(k + 1, 0), K)
    await page.keyboard.press('Backspace')
    const after = await page.evaluate((k) => {
      const c = window.__spike.controller
      return { prev: c.sceneText(k), cur: c.sceneText(k + 1) }
    }, K)
    s = await state(page)
    const firstPara = before.cur.split('\n\n')[0]
    record(
      'Backspace at scene start joins the first paragraph onto the previous scene',
      after.prev === before.prev + firstPara && after.cur === before.cur.split('\n\n').slice(1).join('\n\n') && s.focused === K,
      JSON.stringify({ prevGrew: after.prev.length - before.prev.length, firstPara: firstPara.length, focused: s.focused }),
    )
    await page.keyboard.press(`${mod}+z`)
    const undone = await page.evaluate((k) => {
      const c = window.__spike.controller
      return { prev: c.sceneText(k), cur: c.sceneText(k + 1) }
    }, K)
    record(
      'one undo reverts a cross-scene join in both scenes (expected to fail: history is per scene)',
      undone.prev === before.prev && undone.cur === before.cur,
      JSON.stringify({ prevRestored: undone.prev === before.prev, curRestored: undone.cur === before.cur }),
    )

    // Mouse drag across a boundary
    const M = 200
    let geo = await centreBoundary(page, M)
    const x1 = geo.left + geo.width * 0.4
    const x2 = geo.left + geo.width * 0.6
    const y1 = geo.boundaryY - 80
    const y2 = geo.boundaryY + 90
    await page.mouse.move(x1, y1)
    await page.mouse.down()
    await page.mouse.move(x1 + 5, y1 + 30, { steps: 3 })
    await page.mouse.move(x2, y2, { steps: 8 })
    const during = await page.evaluate(() => {
      const sel = getSelection()
      const scene = (n) => (n && (n.nodeType === 1 ? n : n.parentElement))?.closest?.('.slot')?.dataset.i ?? null
      return { anchorScene: scene(sel.anchorNode), focusScene: scene(sel.focusNode), nativeChars: sel.toString().length }
    })
    await page.mouse.up()
    s = await state(page)
    record(
      'native drag selection stays inside the scene it started in (browser clamps at the editing host)',
      during.anchorScene === during.focusScene,
      JSON.stringify(during),
    )
    record('mouse drag from one scene into the next makes a cross-scene selection', !!s.cross && s.cross.anchor.scene === M && s.cross.head.scene === M + 1, JSON.stringify(s.cross))
    const expectDrag = await page.evaluate(() => {
      const c = window.__spike.controller
      const { anchor, head } = c.cross
      const a = c.models[anchor.scene].doc
      const b = c.models[head.scene].doc
      return a.textBetween(anchor.pos, a.content.size, '\n\n') + '\n\n' + b.textBetween(0, head.pos, '\n\n')
    })
    await page.keyboard.press(`${mod}+c`)
    await sleep(100)
    let copied = await page.evaluate(() => window.__copied)
    record('copy of a cross-scene selection returns the model text', copied === expectDrag && copied.length > 20, `chars=${copied?.length}`)
    const decorated = await page.evaluate(() => document.querySelectorAll('.xsel, .xsel-block').length)
    record('cross-scene selection is drawn in both scenes', decorated >= 2, `decorated nodes=${decorated}`)

    // Typing replaces the cross-scene selection
    const pre = await page.evaluate((m) => {
      const c = window.__spike.controller
      return { a: c.sceneText(m), b: c.sceneText(m + 1), cross: c.cross }
    }, M)
    await page.keyboard.type('Q')
    await sleep(100)
    const post = await page.evaluate((m) => {
      const c = window.__spike.controller
      return { a: c.sceneText(m), b: c.sceneText(m + 1), cross: c.cross, focused: c.focused }
    }, M)
    record(
      'typing over a cross-scene selection deletes it through the model and inserts the character',
      post.cross === null && post.a.endsWith('Q') && post.a.length + post.b.length === pre.a.length + pre.b.length - (expectDrag.length - 2) + 1,
      JSON.stringify({ aEndsWithQ: post.a.endsWith('Q'), removed: pre.a.length + pre.b.length - post.a.length - post.b.length, selected: expectDrag.length - 2, focused: post.focused }),
    )

    // Shift + arrows across a boundary
    const N = 260
    await page.evaluate((k) => window.__spike.jump(k, 1e9), N)
    // Native selection changes reach the editor state asynchronously; pace the keys like a person would.
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft', { delay: 30 })
    await sleep(100)
    s = await state(page)
    const nativeSel = s.size - 1 - s.head
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight', { delay: 30 })
    await sleep(100)
    for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowRight', { delay: 30 })
    s = await state(page)
    record('Shift+ArrowRight past the scene end extends the selection into the next scene', !!s.cross && s.cross.head.scene === N + 1 && s.cross.head.pos === 7, JSON.stringify({ nativeSel, cross: s.cross }))
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Shift+ArrowDown')
    s = await state(page)
    const expectShift = await page.evaluate(() => {
      const c = window.__spike.controller
      const { anchor, head } = c.cross
      const a = c.models[anchor.scene].doc
      const b = c.models[head.scene].doc
      return a.textBetween(anchor.pos, a.content.size, '\n\n') + '\n\n' + b.textBetween(0, head.pos, '\n\n')
    })
    await page.keyboard.press(`${mod}+c`)
    await sleep(100)
    copied = await page.evaluate(() => window.__copied)
    record('Shift+ArrowDown keeps extending inside the next scene; copy matches the model', copied === expectShift && s.cross.head.pos > 40, `head=${JSON.stringify(s.cross?.head)} chars=${copied?.length}`)
    for (let i = 0; i < 40 && (await state(page)).cross; i++) await page.keyboard.press('Shift+ArrowUp')
    s = await state(page)
    record('Shift+ArrowUp back into the first scene returns to a native selection', s.cross === null && s.focused === N, JSON.stringify({ cross: s.cross, focused: s.focused }))

    // Select all and copy through the model
    await page.evaluate((k) => window.__spike.jump(k, 10), N)
    const expectAll = await page.evaluate(() => window.__spike.controller.projectText())
    const mountedBefore = (await state(page)).mounted.length
    await page.keyboard.press(`${mod}+a`)
    const t0 = Date.now()
    await page.keyboard.press(`${mod}+c`)
    await sleep(300)
    copied = await page.evaluate(() => window.__copied)
    const copyMs = await page.evaluate(() => {
      const t = performance.now()
      const text = window.__spike.controller.selectionText()
      return { ms: performance.now() - t, chars: text.length }
    })
    s = await state(page)
    record(
      'select-all then copy returns the whole project from the model',
      copied === expectAll && copied.split(/\s+/).length > 299000,
      `chars=${copied?.length} words=${copied?.split(/\s+/).length} modelReadMs=${copyMs.ms.toFixed(1)} editorsMounted=${s.mounted.length} (before ${mountedBefore}) wall=${Date.now() - t0}ms`,
    )
    await page.keyboard.press('Escape')

    // Find
    const independent = await page.evaluate(() => {
      const text = window.__spike.controller.projectText().toLowerCase()
      let n = 0
      for (let i = text.indexOf('the'); i !== -1; i = text.indexOf('the', i + 3)) n++
      return n
    })
    const found = await page.evaluate(() => window.__spike.find('the'))
    record('find counts every match in the model, mounted or not', found.count === independent && found.count > 10000, `count=${found.count} independent=${independent} ms=${found.ms.toFixed(1)} painted=${found.paintedMs.toFixed(1)}`)
    const far = await page.evaluate(async () => {
      const s = window.__spike
      const c = s.controller
      const n = s.lastFind.count - 3 // near the end of the project, far from the viewport
      const wasMounted = c.views.has(c.models.length - 1)
      const t = performance.now()
      c.gotoMatch(n)
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
      const ms = performance.now() - t
      const mark = document.querySelector('.find-current')
      const rect = mark?.getBoundingClientRect()
      const sr = s.scroller.getBoundingClientRect()
      return { wasMounted, ms, text: mark?.textContent, visible: !!rect && rect.top >= sr.top && rect.bottom <= sr.bottom, scene: c.findScene }
    })
    record('find jumps to a match in a scene that was not mounted', !far.wasMounted && far.text?.toLowerCase() === 'the' && far.visible, JSON.stringify(far))
    const browserFind = await page.evaluate(() => {
      // What the browser's own find-in-page can reach: only text that is in the DOM.
      const dom = document.getElementById('doc').innerText.split(/\s+/).length
      return { wordsInDom: dom }
    })
    record('browser find-in-page reaches the whole project (expected to fail: only mounted text is in the DOM)', browserFind.wordsInDom > 299000, JSON.stringify(browserFind))

    // Pinning: the scene with the selection is not unmounted when it scrolls far away
    await page.evaluate((k) => window.__spike.jump(k, 30), 50)
    await page.evaluate(async () => {
      const s = window.__spike
      s.scroller.scrollTop += 60000
      await new Promise((r) => setTimeout(r, 300))
    })
    s = await state(page)
    record('the scene holding the selection stays mounted after scrolling 60,000 px away', s.mounted.includes(50) && s.focused === 50, `mounted=${JSON.stringify(s.mounted)}`)
    await page.keyboard.type('pinned')
    await sleep(200)
    const pinnedText = await page.evaluate(() => window.__spike.controller.sceneText(50))
    record('typing while the caret scene is off screen still edits that scene', pinnedText.includes('pinned'), '')

    // Composition (Chromium only: CDP can drive an IME composition)
    if (cdp) {
      await page.evaluate((k) => window.__spike.jump(k, 30), 70)
      await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 })
      await page.evaluate(async () => {
        const s = window.__spike
        s.scroller.scrollTop += 80000
        await new Promise((r) => setTimeout(r, 300))
      })
      const composing = await page.evaluate(() => {
        const c = window.__spike.controller
        return { mounted: c.views.has(70), composing: c.views.get(70)?.composing ?? null }
      })
      await cdp.send('Input.insertText', { text: '日本' })
      await sleep(200)
      const text70 = await page.evaluate(() => window.__spike.controller.sceneText(70))
      record('a scene with an active composition is not unmounted, and the composition commits', composing.mounted && composing.composing === true && text70.includes('日本'), JSON.stringify(composing))
    } else {
      record('a scene with an active composition is not unmounted (not testable here: no IME control in WebKit automation)', true, 'skipped')
    }
    await context.close()
  }

  // ----------------------------------------- variant 2: typing after a programmatic jump
  for (const fix of ['0', '1']) {
    const { context, page } = await open(`v=2&v2fix=${fix}`)
    const out = []
    for (const [scene, offset] of [
      [300, 1409],
      [100, 200],
      [599, 50],
    ]) {
      await page.evaluate(([scene, offset]) => window.__spike.jump(scene, offset), [scene, offset])
      await sleep(200)
      await page.keyboard.type('ZQZ')
      await sleep(150)
      const landed = await page.evaluate((scene) => window.__spike.controller.sceneText(scene).includes('ZQZ'), scene)
      out.push(landed)
    }
    record(
      `variant 2: text typed after a jump lands at the caret (selection repair ${fix === '1' ? 'on' : 'off'})`,
      out.every(Boolean),
      `landed in the right scene: ${JSON.stringify(out)}`,
    )
    await context.close()
  }
} finally {
  await browser.close()
  server.close()
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, `functional-${browserName}.json`), JSON.stringify(results, null, 2))
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed (${browserName})`)
