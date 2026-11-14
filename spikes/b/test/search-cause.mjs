// Why is "first 20 hits with snippets" for a very common word slow? Split the query into its parts.
// Usage: node test/search-cause.mjs <chromium|webkit>
import { startServer, launch, newProfile, dropProfile, openPage, save } from './lib.mjs';
const browser = process.argv[2] || 'webkit';
const server = await startServer();
try {
  const profile = newProfile(`search-${browser}`);
  const ctx = await launch(browser, profile);
  const page = await openPage(ctx, '/b/?noprobe=1&vfs=sahpool');
  const r = await page.evaluate(async () => {
    await window.spike.openDb();
    await window.spike.importFixture();
    const variants = {
      'all matching rowids, no order': `SELECT rowid FROM search WHERE search MATCH '"the"'`,
      'top 20 by rank, no snippet': `SELECT rowid FROM search WHERE search MATCH '"the"' ORDER BY rank LIMIT 20`,
      'first 20 in document order, with snippet': `SELECT rowid, snippet(search, 0, '[', ']', '…', 10) FROM search WHERE search MATCH '"the"' LIMIT 20`,
      'top 20 by rank, with snippet (as measured)': `SELECT d.doc_id, snippet(search, 0, '[', ']', '…', 10) FROM search JOIN doc_text d ON d.id = search.rowid WHERE search MATCH '"the"' ORDER BY rank LIMIT 20`,
      'top 20 by rank, with highlight-free excerpt': `SELECT d.doc_id, substr(d.body, 1, 80) FROM search JOIN doc_text d ON d.id = search.rowid WHERE search MATCH '"the"' ORDER BY rank LIMIT 20`,
    };
    const out = {};
    for (const [label, sql] of Object.entries(variants)) {
      const t = [];
      for (let i = 0; i < 15; i++) { const t0 = performance.now(); await window.spike.call('sql', { sql }); t.push(performance.now() - t0); }
      const s = [...t].sort((a, b) => a - b);
      out[label] = { first: +t[0].toFixed(1), median: +s[7].toFixed(1), max: +s[14].toFixed(1) };
    }
    return out;
  });
  for (const [k, v] of Object.entries(r)) console.log(`${browser}: ${k}: first ${v.first}, median ${v.median}, max ${v.max} ms`);
  save(`search-cause-${browser}.json`, r);
  await ctx.close();
  dropProfile(profile);
} finally { server.kill(); }
