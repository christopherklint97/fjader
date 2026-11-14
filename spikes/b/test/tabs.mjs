// Two tabs on the same database.
// Usage: node test/tabs.mjs <chromium|webkit> <plain|coi> <vfs,vfs,...> [seconds=20]
//  A. no lock: open in both tabs; if both open, type in both at once (different scenes) and verify.
//  B. Web Lock: second tab must wait cleanly, then take over when the first tab closes.
import { startServer, launch, newProfile, dropProfile, openPage, save, sleep } from './lib.mjs';

const browser = process.argv[2] || 'chromium';
const mode = process.argv[3] || 'plain';
const vfsList = (process.argv[4] || 'sahpool,coop').split(',');
const seconds = Number(process.argv[5] || 20);
const prefix = mode === 'coi' ? '/coi/b/' : '/b/';

const server = await startServer();
const all = { browser, mode, seconds, vfs: {} };
const slim = (t) => t && !t.error ? { changes: t.changes, storedEqualsLive: t.storedEqualsLive, batchMs: t.workerBatchMs, ackLagMs: t.mainAckLagMs, flushErrors: t.flushErrors } : t;
try {
  for (const vfs of vfsList) {
    const out = (all.vfs[vfs] = {});
    const profile = newProfile(`tabs-${browser}-${vfs}`);
    const ctx = await launch(browser, profile);
    const url = (lock) => `${prefix}?noprobe=1&nokill=1&vfs=${vfs}&lock=${lock}`;
    const tryOpen = (page) => page.evaluate(async () => {
      const t = performance.now();
      try { const i = await window.spike.openDb(); return { ok: true, ms: Math.round(performance.now() - t), lockWaitMs: Math.round(i.timings.lockWaitMs) }; }
      catch (e) { return { ok: false, ms: Math.round(performance.now() - t), error: String(e.message || e).slice(0, 300) }; }
    });

    // ---- A. no coordination
    let p1 = await openPage(ctx, url('none'));
    out.noLock = { tab1: await tryOpen(p1) };
    await p1.evaluate(() => window.spike.importFixture());
    let p2 = await openPage(ctx, url('none'));
    out.noLock.tab2 = await tryOpen(p2);
    console.log(`[${browser} ${mode} ${vfs}] no lock: tab1 ${JSON.stringify(out.noLock.tab1)} tab2 ${JSON.stringify(out.noLock.tab2)}`);
    if (out.noLock.tab2.ok) {
      const run = (page, scene) => page.evaluate(({ s, scene }) => window.spike.typing(s, 'tabs', { autoCompact: false }, scene).catch((e) => ({ error: String(e.message || e) })), { s: seconds, scene });
      const [t1, t2] = await Promise.all([run(p1, 3), run(p2, 5)]);
      out.noLock.typingTab1 = slim(t1);
      out.noLock.typingTab2 = slim(t2);
      out.noLock.verifyTab1Scene = await p1.evaluate(() => window.spike.verifyNow(3)).catch((e) => ({ error: String(e.message) }));
      out.noLock.verifyTab2Scene = await p2.evaluate(() => window.spike.verifyNow(5)).catch((e) => ({ error: String(e.message) }));
      // Reads in one tab while the other writes.
      const reads = p2.evaluate(async () => {
        const times = [];
        const errors = [];
        const end = performance.now() + 8000;
        while (performance.now() < end) {
          const t = performance.now();
          try { await window.spike.call('search', { kind: 'word', q: 'quillfeather', runs: 1 }); times.push(performance.now() - t); } catch (e) { errors.push(String(e.message)); }
          await new Promise((r) => setTimeout(r, 50));
        }
        times.sort((a, b) => a - b);
        return { n: times.length, median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1], errors: errors.length, firstError: errors[0] ?? null };
      });
      const writes = p1.evaluate(() => window.spike.typing(8, 'tabs-rw', { autoCompact: false }, 3).catch((e) => ({ error: String(e.message || e) })));
      const [rd, wr] = await Promise.all([reads, writes]);
      out.noLock.readWhileOtherTabWrites = { reads: rd, writes: slim(wr) };
      console.log(`[${browser} ${mode} ${vfs}] both typing: tab1 p95 ${t1.workerBatchMs?.p95} max ${t1.workerBatchMs?.max} errs ${t1.flushErrors}; tab2 p95 ${t2.workerBatchMs?.p95} max ${t2.workerBatchMs?.max} errs ${t2.flushErrors}; verify ${out.noLock.verifyTab1Scene.ok}/${out.noLock.verifyTab2Scene.ok}; reads ${JSON.stringify(rd)}`);
    }
    await p2.close();
    await p1.close();
    await sleep(500);

    // ---- B. Web Lock: wait, then take over
    p1 = await openPage(ctx, url('exclusive'));
    out.webLock = { tab1: await tryOpen(p1) };
    p2 = await openPage(ctx, url('exclusive'));
    const pending = tryOpen(p2);
    await sleep(2000);
    out.webLock.tab2WhileTab1Open = await p2.evaluate(() => ({ ready: window.spike.state.ready, banner: document.getElementById('dbstate').textContent }));
    const tClose = Date.now();
    await p1.close();
    out.webLock.tab2AfterTab1Closed = await pending;
    out.webLock.takeoverMs = Date.now() - tClose;
    out.webLock.tab2CanWrite = await p2.evaluate(() => window.spike.typing(3, 'tabs-after', { autoCompact: false }, 5).then((t) => ({ changes: t.changes, storedEqualsLive: t.storedEqualsLive }), (e) => ({ error: String(e.message || e) })));
    out.webLock.integrity = await p2.evaluate(() => window.spike.call('integrity'));
    console.log(`[${browser} ${mode} ${vfs}] web lock: waiting=${JSON.stringify(out.webLock.tab2WhileTab1Open)} takeover ${out.webLock.takeoverMs} ms -> ${JSON.stringify(out.webLock.tab2AfterTab1Closed)} write ${JSON.stringify(out.webLock.tab2CanWrite)}`);
    await ctx.close();
    dropProfile(profile);
    save(`tabs-${browser}-${mode}.json`, all);
  }
} finally {
  save(`tabs-${browser}-${mode}.json`, all);
  server.kill();
}
