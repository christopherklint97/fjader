import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, newProfile, dropProfile, openPage } from './lib.mjs';
const browser = process.argv[2] || 'chromium';
const vfs = process.argv[3] || 'sahpool';
const profileName = process.argv[4] || 'tuned';
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push([p, fs.statSync(p).size]);
  }
  return out;
}
const big = (profile, label) => {
  const files = walk(profile).filter(([, s]) => s > 200000).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`-- ${label}`);
  for (const [p, s] of files) console.log(`   ${(s / 1e6).toFixed(2)} MB  ${p.slice(profile.length)}`);
};
const server = await startServer();
try {
  const profile = newProfile('disk');
  const ctx = await launch(browser, profile);
  const page = await openPage(ctx, `/b/?noprobe=1&vfs=${vfs}&profile=${profileName}`);
  const est = () => page.evaluate(async () => (await navigator.storage.estimate()).usage);
  await page.evaluate(() => window.spike.openDb());
  await page.evaluate(() => window.spike.importFixture());
  big(profile, 'after import; estimate ' + (await est()));
  await page.evaluate(() => window.spike.call('exec', { sql: 'VACUUM' }));
  big(profile, 'after VACUUM; estimate ' + (await est()));
  await page.evaluate(() => window.spike.call('sql', { sql: 'PRAGMA wal_checkpoint(TRUNCATE)' }));
  big(profile, 'after checkpoint(TRUNCATE); estimate ' + (await est()));
  await page.evaluate(() => window.spike.typing(10, 'x', { autoCompact: false }));
  big(profile, 'after 10 s typing; estimate ' + (await est()));
  await page.evaluate(() => window.spike.call('close'));
  await new Promise((r) => setTimeout(r, 1000));
  big(profile, 'after close; estimate ' + (await est()));
  await ctx.close();
  dropProfile(profile);
} finally { server.kill(); }
