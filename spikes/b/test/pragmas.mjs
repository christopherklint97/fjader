// Write-latency comparison across storage layers, pragma profiles and batch intervals.
// Rounds are interleaved (A, B, C, A, B, C, ...) so that other load on the host hits all
// combinations alike; each row also carries a CPU calibration value.
// Usage: node test/pragmas.mjs <chromium|webkit> <plain|coi> <vfs:profile,...> [seconds=20] [rounds=3]
import fs from 'node:fs';
import { startServer, launch, newProfile, dropProfile, openPage, save } from './lib.mjs';

const browser = process.argv[2] || 'chromium';
const mode = process.argv[3] || 'plain';
const combos = (process.argv[4] || 'sahpool:default,sahpool:truncate,sahpool:wal-limit,coop:default,coop:sync-normal').split(',').map((c) => c.split(':'));
const seconds = Number(process.argv[5] || 20);
const rounds = Number(process.argv[6] || 3);
const prefix = mode === 'coi' ? '/coi/b/' : '/b/';
const outName = `pragmas-${browser}-${mode}.json`;

const server = await startServer();
const all = { browser, mode, seconds, rounds, runs: [] };
const profiles = new Map();
const one = async (vfs, profileName, batch, round) => {
  const key = `${vfs}:${profileName}`;
  let first = false;
  if (!profiles.has(key)) { profiles.set(key, newProfile(`pragma-${browser}-${vfs}`)); first = true; }
  const ctx = await launch(browser, profiles.get(key));
  const row = { vfs, profile: profileName, batchMs: batch, round, load: fs.readFileSync('/proc/loadavg', 'utf8').split(' ')[0] };
  try {
    const page = await openPage(ctx, `${prefix}?noprobe=1&nokill=1&vfs=${vfs}&profile=${profileName}`);
    page.setDefaultTimeout(15 * 60 * 1000);
    const info = await page.evaluate(async () => { const i = await window.spike.openDb(); return { journal: i.journalMode, sync: i.synchronous, locking: i.lockingMode }; });
    Object.assign(row, info);
    if (first) row.importMs = Math.round((await page.evaluate(() => window.spike.importFixture())).timings.importWithoutGenerateMs);
    const t = await page.evaluate(({ s, batch }) => { window.spike.setOpts({ batchMs: batch }); return window.spike.typing(s, 'p', { autoCompact: false }); }, { s: seconds, batch });
    Object.assign(row, { batch_: t.workerBatchMs, batchSize: t.workerBatchSize.median, ackLag: t.mainAckLagMs, cal: t.cpuCalibrationMs?.median ?? null });
    console.log(`[${browser} ${mode}] round ${round} ${vfs}/${profileName} (${info.journal}, sync ${info.sync}) batch ${batch}: n=${t.workerBatchMs.n} median ${t.workerBatchMs.median.toFixed(2)} p95 ${t.workerBatchMs.p95.toFixed(2)} max ${t.workerBatchMs.max.toFixed(2)} ms; lag p95 ${t.mainAckLagMs.p95}; cal ${row.cal}; load ${row.load}`);
  } catch (e) {
    row.error = String(e.message || e).slice(0, 300);
    console.log(`[${browser} ${mode}] ${vfs}/${profileName} FAILED ${row.error}`);
  }
  all.runs.push(row);
  save(outName, all);
  await ctx.close().catch(() => {});
};
try {
  for (let round = 1; round <= rounds; round++) for (const [vfs, profileName] of combos) await one(vfs, profileName, 250, round);
  // Batch interval sweep on the recommended profile of each layer.
  for (const batch of [0, 100, 500]) for (const vfs of [...new Set(combos.map((c) => c[0]))]) await one(vfs, 'tuned', batch, 'sweep');
} finally {
  for (const dir of profiles.values()) dropProfile(dir);
  save(outName, all);
  server.kill();
}
