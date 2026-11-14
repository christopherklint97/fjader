import { startServer, launch, newProfile, dropProfile, openPage } from './lib.mjs';
const server = await startServer();
const browser = process.argv[2] || 'webkit';
try {
  const profile = newProfile('dbg');
  const ctx = await launch(browser, profile);
  const page = await openPage(ctx, '/coi/b/?noprobe=1', { log: true });
  page.on('worker', (w) => console.log('[worker]', w.url()));
  page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText));
  page.on('response', (r) => { if (r.url().includes('proxy')) console.log('[response]', r.status(), r.url(), JSON.stringify(r.headers())); });
  const seqs = (process.argv[3] || 'opfs,opfs').split(',');
  const r = await page.evaluate(async (seqs) => {
    const out = [];
    for (const v of seqs) { const p = await window.spike.probe(v); out.push([v, p.ok ? 'ok ' + p.initMs : p.error]); }
    return out;
  }, seqs);
  console.log(JSON.stringify(r));
  await ctx.close();
  dropProfile(profile);
} finally { server.kill(); }
