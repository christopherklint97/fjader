// Kill-and-reopen test. The page types into one scene; the harness reads the
// counters, kills the browser, relaunches with the same profile and verifies.
// Usage: node test/kill.mjs <chromium|webkit> <plain|coi> <vfs,vfs,...> [kills=20] [stressKills=20]
//
// Kill kinds:
//   sigkill-all       SIGKILL every process of the browser at once (hardest case)
//   sigkill-renderer  SIGKILL only the content process, as iOS does to a web app (Chromium only)
//   page-close        page.close() without unload handlers
//   context-close     close the browser normally mid-write
// Settings: "normal" = one change per 100 ms, 250 ms batches.
//           "stress" = one change per 5 ms, every change its own transaction,
//           so a kill is likely to land inside a write.
import { execSync } from 'node:child_process';
import { startServer, launch, newProfile, dropProfile, openPage, save, sleep } from './lib.mjs';

const browser = process.argv[2] || 'chromium';
const mode = process.argv[3] || 'plain';
const vfsList = (process.argv[4] || 'sahpool,coop').split(',');
const kills = Number(process.argv[5] || 20);
const stressKills = Number(process.argv[6] || 20);
const prefix = mode === 'coi' ? '/coi/b/' : '/b/';
const KILL_SCENE = 2;

function pidsFor(profile) {
  // All processes whose command line mentions the profile directory, plus their descendants.
  const out = execSync('ps -eo pid=,ppid=,args=', { encoding: 'utf8', maxBuffer: 1 << 24 });
  const procs = out.split('\n').filter(Boolean).map((l) => {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    return m ? { pid: +m[1], ppid: +m[2], args: m[3] } : null;
  }).filter(Boolean);
  const set = new Map();
  for (const p of procs) if (p.args.includes(profile) && p.pid !== process.pid && !p.args.startsWith('ps ')) set.set(p.pid, p);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of procs) if (set.has(p.ppid) && !set.has(p.pid)) { set.set(p.pid, p); grew = true; }
  }
  return [...set.values()];
}

function sigkill(pids) {
  for (const pid of pids) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

const server = await startServer();
const all = { browser, mode, startedAt: new Date().toISOString(), vfs: {} };
try {
  for (const vfs of vfsList) {
    const profile = newProfile(`kill-${browser}-${vfs}`);
    const res = (all.vfs[vfs] = { runs: [], summary: null });
    let ctx = await launch(browser, profile);
    let page = await openPage(ctx, `${prefix}?noprobe=1&nokill=1&vfs=${vfs}`);
    await page.evaluate(async () => { await window.spike.openDb(); await window.spike.importFixture(); });

    const plan = [];
    const kinds = browser === 'chromium'
      ? ['sigkill-all', 'sigkill-all', 'sigkill-renderer', 'sigkill-all', 'page-close', 'sigkill-all', 'sigkill-renderer', 'sigkill-all', 'context-close', 'sigkill-all']
      : ['sigkill-all', 'sigkill-all', 'page-close', 'sigkill-all', 'context-close'];
    // "kills" SIGKILL-all runs at normal settings, with the other kinds interleaved.
    let n = 0;
    for (let i = 0; n < kills; i++) { const k = kinds[i % kinds.length]; plan.push({ kind: k, setting: 'normal' }); if (k === 'sigkill-all') n++; }
    n = 0;
    for (let i = 0; n < stressKills; i++) { const k = kinds[i % kinds.length]; plan.push({ kind: k, setting: 'stress' }); if (k === 'sigkill-all') n++; }

    for (let i = 0; i < plan.length; i++) {
      const { kind, setting } = plan[i];
      const interval = setting === 'stress' ? 5 : 100;
      const batch = setting === 'stress' ? 0 : 250;
      // Start (or resume) typing; do not await: it runs until killed.
      await page.evaluate(({ interval, batch }) => {
        window.spike.setOpts({ batchMs: batch });
        window.spike.call('config', { batchMs: batch, compactCount: 300 });
        void window.spike.killStart(true, interval);
      }, { interval, batch });
      await sleep(2500 + Math.floor(Math.random() * 4000));
      const before = await page.evaluate(() => ({ sent: window.spike.state.sent, durable: window.spike.state.durable, t: Date.now() }));
      const t0 = Date.now();
      if (kind === 'sigkill-all') {
        sigkill(pidsFor(profile));
      } else if (kind === 'sigkill-renderer') {
        sigkill(pidsFor(profile).filter((p) => p.args.includes('--type=renderer')));
        await sleep(300);
        await ctx.close().catch(() => {});
      } else if (kind === 'page-close') {
        await page.close({ runBeforeUnload: false });
        await ctx.close().catch(() => {});
      } else {
        await ctx.close().catch(() => {});
      }
      await ctx.close().catch(() => {});
      await sleep(400);
      sigkill(pidsFor(profile)); // nothing may survive into the next launch

      const run = { i: i + 1, kind, setting, observedSent: before.sent, observedDurable: before.durable, killDelayMs: t0 - before.t };
      try {
        ctx = await launch(browser, profile);
        page = await openPage(ctx, `${prefix}?noprobe=1&nokill=1&vfs=${vfs}`);
        const r = await page.evaluate(async (scene) => {
          const t = performance.now();
          const info = await window.spike.openDb();
          const openMs = performance.now() - t;
          const v = await window.spike.verifyNow(scene);
          const ls = JSON.parse(localStorage.getItem('spikeb.kill') || '{}');
          return { openMs, journal: info.journalMode, v, lsSent: ls.sent ?? null, lsActive: ls.active ?? null };
        }, KILL_SCENE);
        Object.assign(run, {
          reopenMs: Math.round(r.openMs),
          recovered: r.v.durableSeq,
          pendingUpdates: r.v.pendingUpdates,
          textMatch: r.v.textMatch,
          contiguous: r.v.contiguous,
          integrity: r.v.integrity,
          fts: r.v.fts,
          ok: r.v.ok,
          lostChanges: Math.max(0, before.sent - r.v.durableSeq),
          lostMs: Math.max(0, before.sent - r.v.durableSeq) * interval,
          ackedButLost: Math.max(0, before.durable - r.v.durableSeq),
          localStorageSent: r.lsSent,
          localStorageLagChanges: r.lsSent === null ? null : before.sent - r.lsSent,
        });
      } catch (e) {
        Object.assign(run, { ok: false, error: String(e.message || e).slice(0, 400) });
        // Try to continue with a fresh page so one failure does not hide the rest.
        try { ctx = await launch(browser, profile); page = await openPage(ctx, `${prefix}?noprobe=1&nokill=1&vfs=${vfs}`); await page.evaluate(() => window.spike.openDb()); } catch { /* give up below */ }
      }
      res.runs.push(run);
      console.log(`[${browser} ${mode} ${vfs}] #${run.i} ${kind}/${setting}: sent ${run.observedSent} durable ${run.observedDurable} -> recovered ${run.recovered}; lost ${run.lostChanges} (${run.lostMs} ms) ackedButLost ${run.ackedButLost} ok=${run.ok}${run.error ? ' ' + run.error : ''}`);
      const by = (f) => res.runs.filter(f);
      const sum = (rs) => ({
        runs: rs.length,
        failures: rs.filter((r) => !r.ok).length,
        ackedButLost: rs.filter((r) => r.ackedButLost > 0).length,
        maxLostMs: Math.max(0, ...rs.map((r) => r.lostMs ?? 0)),
        medianLostMs: rs.map((r) => r.lostMs ?? 0).sort((a, b) => a - b)[Math.floor(rs.length / 2)] ?? 0,
        maxReopenMs: Math.max(0, ...rs.map((r) => r.reopenMs ?? 0)),
      });
      res.summary = {
        all: sum(res.runs),
        normal: sum(by((r) => r.setting === 'normal')),
        stress: sum(by((r) => r.setting === 'stress')),
        sigkillAllNormal: sum(by((r) => r.setting === 'normal' && r.kind === 'sigkill-all')),
        sigkillRenderer: sum(by((r) => r.kind === 'sigkill-renderer')),
        localStorageLost: by((r) => r.kind.startsWith('sigkill') && r.localStorageSent === null).length,
        localStorageMaxLagChanges: Math.max(0, ...res.runs.map((r) => r.localStorageLagChanges ?? 0)),
      };
      save(`kill-${browser}-${mode}.json`, all);
    }
    console.log(`[${browser} ${mode} ${vfs}] summary ${JSON.stringify(res.summary)}`);
    await ctx.close().catch(() => {});
    sigkill(pidsFor(profile));
    dropProfile(profile);
  }
} finally {
  all.finishedAt = new Date().toISOString();
  save(`kill-${browser}-${mode}.json`, all);
  server.kill();
}
