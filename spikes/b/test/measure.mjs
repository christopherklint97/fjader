// Full measurement pass for one browser.
// Usage: node test/measure.mjs <chromium|webkit> <plain|coi> <vfs,vfs,...> [typingSeconds=300] [coldRuns=5]
import fs from 'node:fs';
import { startServer, launch, newProfile, dropProfile, openPage, save, opfsDiskBytes } from './lib.mjs';

const browser = process.argv[2] || 'chromium';
const mode = process.argv[3] || 'plain';
const vfsList = (process.argv[4] || 'sahpool,coop').split(',');
const typingSeconds = Number(process.argv[5] || 300);
const coldRuns = Number(process.argv[6] || 5);
const prefix = mode === 'coi' ? '/coi/b/' : '/b/';
const T = 20 * 60 * 1000;
const outName = `measure-${browser}-${mode}${process.env.SPIKE_TAG ? '-' + process.env.SPIKE_TAG : ''}.json`;

const server = await startServer();
const all = { browser, mode, typingSeconds, startedAt: new Date().toISOString(), vfs: {} };
try {
  for (const vfs of vfsList) {
    const out = (all.vfs[vfs] = {});
    const profile = newProfile(`${browser}-${vfs}`);
    out.load = {};
    const step = async (name, fn) => {
      const t0 = Date.now();
      out.load[name] = fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 2).join(' ');
      try {
        out[name] = await fn();
        console.log(`[${browser} ${mode} ${vfs}] ${name} ok (${Date.now() - t0} ms)`);
      } catch (e) {
        out[name] = { error: String(e.message || e).slice(0, 500) };
        console.log(`[${browser} ${mode} ${vfs}] ${name} FAILED: ${out[name].error}`);
      }
      save(outName, all);
    };

    let ctx = await launch(browser, profile);
    let page = await openPage(ctx, `${prefix}?noprobe=1&vfs=${vfs}`);
    page.setDefaultTimeout(T);
    await step('userAgent', () => page.evaluate(() => navigator.userAgent));
    await step('info', () => page.evaluate(async () => { const i = await window.spike.openDb(); delete i.compileOptions; return i; }));
    await step('import', () => page.evaluate(() => window.spike.importFixture()));
    await step('diskAfterImport', async () => opfsDiskBytes(profile));
    await step('integrityAfterImport', () => page.evaluate(() => window.spike.call('integrity')));
    await step('vacuumAfterImport', () => page.evaluate(async () => {
      const t0 = performance.now();
      await window.spike.call('exec', { sql: 'VACUUM' });
      await window.spike.call('sql', { sql: 'PRAGMA wal_checkpoint(TRUNCATE)' });
      const ms = performance.now() - t0;
      const s = await window.spike.call('sizes');
      return { ms, fileBytes: s.fileBytes, freeBytes: s.freeBytes, onDisk: s.onDisk, payload: s.payload, estimate: s.estimate };
    }));
    await step('diskAfterVacuum', async () => opfsDiskBytes(profile));
    await ctx.close();

    // Cold opens: a new browser process each time, same profile.
    out.cold = [];
    for (let i = 0; i < coldRuns; i++) {
      ctx = await launch(browser, profile);
      page = await openPage(ctx, `${prefix}?vfs=${vfs}&autoopen=1`);
      const r = await page.evaluate(() => {
        const b = Object.entries(window.spike.results()).find(([k]) => !k.startsWith('environment'))[1];
        return { open: b.open, docLoad: b.docLoad, error: window.spike.state.lastError };
      });
      out.cold.push(r);
      if (i < coldRuns - 1) await ctx.close();
    }
    console.log(`[${browser} ${mode} ${vfs}] cold opens: nav->tree ${out.cold.map((c) => Math.round(c.open?.pageClockAtTreeMs ?? -1)).join(', ')} ms`);
    save(outName, all);
    page.setDefaultTimeout(T);

    await step('search', () => page.evaluate(() => window.spike.search()));
    await step('typing', () => page.evaluate((s) => window.spike.typing(s, 'typing', { autoCompact: false }), typingSeconds));
    await step('diskAfterTyping', async () => opfsDiskBytes(profile));
    await step('verifyTypingScene', () => page.evaluate(() => window.spike.verifyNow(3)));
    await step('compaction', () => page.evaluate(() => window.spike.compaction()));
    await step('snapshots', () => page.evaluate(() => window.spike.snapshots()));
    await step('ftsVariants', () => page.evaluate(() => window.spike.ftsVariants()));
    await step('sizesEnd', () => page.evaluate(() => window.spike.sizesNow()));
    await step('diskEnd', async () => opfsDiskBytes(profile));
    await step('integrityEnd', () => page.evaluate(() => window.spike.call('integrity')));
    await step('vacuum', () => page.evaluate(async () => {
      const t0 = performance.now();
      await window.spike.call('exec', { sql: 'VACUUM' });
      await window.spike.call('sql', { sql: 'PRAGMA wal_checkpoint(TRUNCATE)' });
      const ms = performance.now() - t0;
      const s = await window.spike.call('sizes');
      return { ms, fileBytes: s.fileBytes, freeBytes: s.freeBytes, onDisk: s.onDisk, estimate: s.estimate };
    }));
    await step('diskAfterFinalVacuum', async () => opfsDiskBytes(profile));
    await step('heap', () => page.evaluate(() => (performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize } : null)));
    await ctx.close();
    dropProfile(profile);
  }
} finally {
  all.finishedAt = new Date().toISOString();
  save(outName, all);
  server.kill();
}
