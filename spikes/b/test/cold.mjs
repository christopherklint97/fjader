// Cold-open timings on a quiet host: new browser process per run, same profile.
// Usage: node test/cold.mjs <chromium|webkit> <plain|coi> <vfs,vfs,...> [runs=10]
import { startServer, launch, newProfile, dropProfile, openPage, save } from './lib.mjs';

const browser = process.argv[2] || 'chromium';
const mode = process.argv[3] || 'plain';
const vfsList = (process.argv[4] || 'sahpool,coop').split(',');
const runs = Number(process.argv[5] || 10);
const prefix = mode === 'coi' ? '/coi/b/' : '/b/';
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return { min: +s[0].toFixed(1), median: +s[Math.floor(s.length / 2)].toFixed(1), max: +s[s.length - 1].toFixed(1) }; };

const server = await startServer();
const all = { browser, mode, runs, vfs: {} };
try {
  for (const vfs of vfsList) {
    const profile = newProfile(`cold-${browser}-${vfs}`);
    let ctx = await launch(browser, profile);
    let page = await openPage(ctx, `${prefix}?noprobe=1&vfs=${vfs}`);
    await page.evaluate(async () => { await window.spike.openDb(); await window.spike.importFixture(); await window.spike.call('exec', { sql: 'VACUUM' }); await window.spike.call('sql', { sql: 'PRAGMA wal_checkpoint(TRUNCATE)' }); });
    await ctx.close();
    const rows = [];
    let failures = 0;
    for (let i = 0; i < runs; i++) {
      ctx = await launch(browser, profile);
      try {
        page = await openPage(ctx, `${prefix}?vfs=${vfs}&autoopen=1`);
        const r = await page.evaluate(() => {
          const b = Object.entries(window.spike.results()).find(([k]) => !k.startsWith('environment'))?.[1];
          return { open: b?.open, docLoad: b?.docLoad, error: window.spike.state.lastError };
        });
        if (r.open) rows.push(r); else { failures++; console.log('  cold open failed:', r.error); }
      } catch (e) { failures++; console.log('  cold open failed:', String(e.message).slice(0, 200)); }
      await ctx.close();
    }
    const pick = (f) => med(rows.map(f));
    const summary = {
      ok: rows.length,
      failures,
      navToTreeMs: pick((r) => r.open.pageClockAtTreeMs),
      navToFirstDocMs: pick((r) => r.open.pageClockAtDocMs),
      workerStartToTreeMs: pick((r) => r.open.treeLoadedMs),
      initMs: pick((r) => r.open.initBreakdown.initTotalMs),
      wasmInitMs: pick((r) => r.open.initBreakdown.wasmInitMs),
      vfsInstallMs: pick((r) => r.open.initBreakdown.vfsInstallMs),
      dbOpenMs: pick((r) => r.open.initBreakdown.dbOpenMs),
      pragmaMs: pick((r) => r.open.initBreakdown.pragmaMs),
      schemaMs: pick((r) => r.open.initBreakdown.schemaMs),
      treeQueryMs: pick((r) => r.open.treeQueryMs),
      firstDocMs: pick((r) => r.open.firstDocMs),
      warmTypicalDocMedianMs: pick((r) => r.docLoad.typicalDocMs.median),
      warmTypicalDocP95Ms: pick((r) => r.docLoad.typicalDocMs.p95),
      warmBigDocMedianMs: pick((r) => r.docLoad.bigDocMs.median),
    };
    all.vfs[vfs] = { summary, rows };
    console.log(`[${browser} ${mode} ${vfs}] ${JSON.stringify(summary)}`);
    save(`cold-${browser}-${mode}.json`, all);
    dropProfile(profile);
  }
} finally {
  save(`cold-${browser}-${mode}.json`, all);
  server.kill();
}
