// Load the deployed phone demo through the demo host's local port and probe every storage layer.
// Usage: node test/host-smoke.mjs [base=http://127.0.0.1:8080] [chromium|webkit]
import { browserType, newProfile, dropProfile, save } from './lib.mjs';
const base = process.argv[2] || 'http://127.0.0.1:8080';
const name = process.argv[3] || 'chromium';
const out = {};
for (const p of ['/b/', '/coi/b/']) {
  const profile = newProfile(`host-${name}`);
  const ctx = await browserType(name).launchPersistentContext(profile, { headless: true });
  const page = await ctx.newPage();
  const failed = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('pageerror', (e) => failed.push('pageerror ' + e.message));
  await page.goto(base + p + '?noprobe=1');
  await page.waitForFunction(() => window.spike && window.spike.bootDone, null, { timeout: 60000 });
  const r = await page.evaluate(async () => { const { env, probes } = await window.spike.envReport(true); return { coi: env.crossOriginIsolated, opfs: env.opfs, probes, title: document.title }; });
  out[p] = { ...r, failed };
  console.log(p, 'title', r.title, 'isolated', r.coi, 'opfs', r.opfs, 'failed requests', failed.length);
  for (const x of r.probes) console.log('  ', x.vfs, x.ok ? `ok ${x.initMs} ms, SQLite ${x.sqlite}, FTS5 ${x.fts5}` : `FAIL ${x.error}`);
  await ctx.close();
  dropProfile(profile);
}
save(`host-smoke-${name}.json`, out);
