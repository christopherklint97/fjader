import { startServer, launch, newProfile, openPage, save } from './lib.mjs';
const browser = process.argv[2] || 'chromium';
const server = await startServer();
const out = {};
try {
  for (const mode of ['/b/', '/coi/b/']) {
    const ctx = await launch(browser, newProfile(`smoke-${browser}`));
    const page = await openPage(ctx, mode + '?noprobe=1', { log: true });
    const r = await page.evaluate(async () => {
      const { env, probes } = await window.spike.envReport(true);
      return { env, probes };
    });
    out[mode] = r;
    console.log(mode, 'coi=', r.env.crossOriginIsolated, 'opfs=', r.env.opfs, r.env.opfsError || '', 'persist=', r.env.persistResult, JSON.stringify(r.env.estimate));
    for (const p of r.probes) console.log('  ', p.vfs, p.ok ? `ok ${p.initMs}ms sqlite ${p.sqlite} fts5=${p.fts5}` : `FAIL ${p.error}`);
    await ctx.close();
  }
  save(`smoke-${browser}.json`, out);
} finally {
  server.kill();
}
