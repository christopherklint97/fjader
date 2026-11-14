// Page: buttons, readout, kill-test flow. Exposes window.spike for the automated runs.
import {
  Client,
  compactionCurve,
  docLoadTimes,
  environment,
  openProject,
  probe,
  searchAll,
  snapshotRestore,
  typingRun,
  verifyScene,
  wipeAll,
  type OpenOpts,
} from './client';
import { VFS_LABEL, type PragmaProfile, type VfsName } from './db';

const KILL_SCENE = 2;
const TYPING_SCENE = 3;
const KILL_KEY = 'spikeb.kill';
const KILLLOG_KEY = 'spikeb.killlog';
const RESULTS_KEY = 'spikeb.results';
const ALL_VFS: VfsName[] = ['sahpool', 'coop', 'opfs', 'opfs-wl'];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

let client: Client | null = null;
let busy = false;
let killRunning = false;
let stopTyping = false;
let flushErrors = 0;
const state = { sent: 0, durable: 0, running: false, ready: false, lastError: '' };

// ---------------------------------------------------------------- storage of results

function loadJson<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode or full */
  }
}

const mode = () => (crossOriginIsolated ? 'isolated' : 'plain');
let results: Record<string, any> = loadJson(RESULTS_KEY, {});

function record(vfs: string | null, key: string, value: unknown) {
  const bucket = vfs ? `${vfs} [${mode()}]` : `environment [${mode()}]`;
  results[bucket] = results[bucket] ?? {};
  results[bucket][key] = value;
  results[bucket].at = new Date().toISOString();
  saveJson(RESULTS_KEY, results);
  renderResults();
}

function log(msg: string, cls = '') {
  const el = $('log');
  const line = `${new Date().toLocaleTimeString()}  ${msg}\n`;
  el.textContent = line + (el.textContent ?? '').slice(0, 6000);
  if (cls) $('banner').innerHTML = `<span class="${cls}">${escapeHtml(msg)}</span>`;
}
const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const ms = (x: number) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10) + ' ms';
const mb = (x: number) => (x / 1e6).toFixed(2) + ' MB';

// ---------------------------------------------------------------- rendering

function verdict(pass: boolean | null, text: string) {
  return `<span class="${pass === null ? 'warn' : pass ? 'ok' : 'bad'}">${pass === null ? 'n/a' : pass ? 'PASS' : 'FAIL'}</span> ${escapeHtml(text)}`;
}

function renderResults() {
  $('results').textContent = JSON.stringify(results, null, 1);
  const rows: string[] = [];
  for (const [bucket, r] of Object.entries(results)) {
    if (bucket.startsWith('environment')) continue;
    const add = (name: string, html: string) => rows.push(`<tr><td>${escapeHtml(bucket)}</td><td>${name}</td><td>${html}</td></tr>`);
    if (r.open) {
      add('Tree loaded (≤ 300 ms)', verdict(r.open.treeLoadedMs <= 300, ms(r.open.treeLoadedMs) + ` (init ${ms(r.open.initDoneMs)}, query ${ms(r.open.treeQueryMs)})`));
      add('First document (≤ 50 ms)', verdict(r.open.firstDocMs <= 50, ms(r.open.firstDocMs)));
    }
    if (r.docLoad) {
      add('Document load, typical (≤ 50 ms)', verdict(r.docLoad.typicalDocMs.p95 <= 50, `median ${ms(r.docLoad.typicalDocMs.median)}, p95 ${ms(r.docLoad.typicalDocMs.p95)}`));
      add('Document load, 10,000 words (≤ 50 ms)', verdict(r.docLoad.bigDocMs.median <= 50, `median ${ms(r.docLoad.bigDocMs.median)}`));
    }
    if (r.import) {
      add('Import', `${ms(r.import.timings.importWithoutGenerateMs)} + index optimise ${ms(r.import.timings.ftsOptimizeMs)}`);
      add('Stored size (≤ 30 MB)', verdict(r.import.sizes.fileBytes <= 30e6, mb(r.import.sizes.fileBytes) + ` (free pages inside: ${mb(r.import.sizes.freeBytes)})`));
      const pl = r.import.sizes.payload;
      add('Size split', `document states ${mb(pl.docStateBytes)}, update log ${mb(pl.updateLogBytes)}, plain text ${mb(pl.plainTextBytes)}, word index ${mb(pl.wordIndexBytes)}, trigram index ${mb(pl.trigramIndexBytes)}`);
    }
    for (const k of Object.keys(r).filter((k) => k.startsWith('typing'))) {
      const t = r[k];
      add(`${k}: write batch p95 (≤ 20 ms)`, verdict(t.workerBatchMs.p95 <= 20, `p95 ${ms(t.workerBatchMs.p95)}, max ${ms(t.workerBatchMs.max)}, n=${t.workerBatchMs.n}`));
      add(`${k}: change durable within 500 ms`, verdict(t.mainAckLagMs.p95 <= 500, `p95 ${ms(t.mainAckLagMs.p95)}, max ${ms(t.mainAckLagMs.max)}`));
      if (t.sizeAfterTyping) add(`${k}: update log`, `${t.sizeAfterTyping.updateLogRows} rows, ${t.sizeAfterTyping.updateLogBytes - t.sizeBefore.updateLogBytes} bytes; compacted into ${t.compactAfterRun.bytesAfter} bytes of state (was ${t.compactAfterRun.bytesBefore}) in ${ms(t.compactAfterRun.totalMs)}`);
      add(`${k}: main thread`, `per change p95 ${ms(t.mainPerChangeMs.p95)}, timer drift p95 ${ms(t.mainTimerDriftMs.p95)} max ${ms(t.mainTimerDriftMs.max)}`);
    }
    if (r.search) {
      const s = r.search;
      const worst = Math.max(s.wordCommon.top20WithSnippet.p95, s.wordRare.top20WithSnippet.p95, s.phrase.top20WithSnippet.p95);
      add('Word and phrase search (≤ 150 ms)', verdict(worst <= 150, `worst p95 ${ms(worst)}; common-word all hits ${ms(s.wordCommon.allHits.median)}`));
      add('Substring (trigram index)', `${ms(s.substringTrigram.allHits.median)}; LIKE scan ${ms(s.substringLikeScan.allHits.median)}`);
      add('Regular-expression scan (≤ 1.5 s)', verdict(s.regexScan.allHits.p95 <= 1500, `median ${ms(s.regexScan.allHits.median)}, p95 ${ms(s.regexScan.allHits.p95)}`));
      add('Search hit counts', verdict(s.hitsCorrect, s.hitsCorrect ? 'as planted' : 'unexpected counts'));
    }
    if (r.compaction) {
      for (const k of ['typicalScene', 'bigScene']) {
        const last = r.compaction[k][r.compaction[k].length - 1];
        const mid = r.compaction[k][1];
        add(`Compaction, ${k}`, `${mid.pendingUpdates} updates: load ${ms(mid.loadWithLogMs)}, compact ${ms(mid.compactTotalMs)}; ${last.pendingUpdates} updates: load ${ms(last.loadWithLogMs)}, compact ${ms(last.compactTotalMs)}`);
      }
    }
    if (r.snapshots) {
      for (const k of ['typicalScene', 'bigScene']) {
        const s = r.snapshots[k];
        add(`Snapshot, ${k} (≤ 50 ms)`, verdict(s.snapshotMs.p95 <= 50, `median ${ms(s.snapshotMs.median)}, max ${ms(s.snapshotMs.max)}`));
        add(`Restore, ${k} (≤ 100 ms)`, verdict(s.restoreReplaceAndReloadMs.max <= 100 && s.restoredTextCorrect, `replace ${ms(s.restoreReplaceAndReloadMs.median)}, forward ${ms(s.restoreForwardAndReloadMs.median)}`));
      }
      add('Snapshot all documents', ms(r.snapshots.snapshotAll.ms));
    }
  }
  $('summary').innerHTML = rows.length ? `<table><tr><th>Layer [mode]</th><th>Measure</th><th>Result</th></tr>${rows.join('')}</table>` : '';
}

function renderKillLog() {
  const logRows: any[] = loadJson(KILLLOG_KEY, []);
  if (!logRows.length) {
    $('killlog').innerHTML = '<span class="muted">No kills recorded yet.</span>';
    return;
  }
  const byVfs = new Map<string, any[]>();
  for (const r of logRows) byVfs.set(r.vfs, [...(byVfs.get(r.vfs) ?? []), r]);
  let html = '';
  for (const [vfs, rows] of byVfs) {
    const bad = rows.filter((r) => !r.ok).length;
    const maxLost = Math.max(...rows.map((r) => r.lostChanges ?? 0));
    html += `<p><b>${escapeHtml(vfs)}</b>: ${rows.length} reopen(s), ${bad ? `<span class="bad">${bad} with errors</span>` : '<span class="ok">no corruption</span>'}, worst loss ${maxLost} change(s) = ${maxLost * 100} ms</p>`;
  }
  html += '<table><tr><th>#</th><th>Layer</th><th>What</th><th>Last sent</th><th>Recovered</th><th>Lost</th><th>Text</th><th>DB check</th><th>Open</th></tr>';
  for (const r of logRows.slice().reverse()) {
    html += `<tr><td>${r.n}</td><td>${escapeHtml(r.vfs)}</td><td>${escapeHtml(r.note ?? '')}</td><td>${r.lastSent ?? '?'}</td><td>${r.recovered ?? '–'}</td>
      <td class="${(r.lostChanges ?? 0) <= 10 ? 'ok' : 'bad'}">${r.lostChanges ?? '?'} (${(r.lostChanges ?? 0) * 100} ms)</td>
      <td class="${r.textMatch ? 'ok' : 'bad'}">${r.textMatch ? 'intact' : 'MISMATCH'}</td>
      <td class="${r.integrityOk ? 'ok' : 'bad'}">${r.integrityOk ? 'ok' : escapeHtml(String(r.error ?? r.integrity ?? 'failed'))}</td>
      <td>${r.reopenMs ?? '–'} ms</td></tr>`;
  }
  $('killlog').innerHTML = html + '</table>';
}

function renderEnv(env: any, probes?: any[]) {
  const yes = (b: boolean) => (b ? '<span class="ok">yes</span>' : '<span class="bad">no</span>');
  let html = `<table>
    <tr><td>Cross-origin isolated (COOP/COEP)</td><td>${yes(env.crossOriginIsolated)} <span class="muted">${escapeHtml(env.url)}</span></td></tr>
    <tr><td>SharedArrayBuffer / Atomics.waitAsync</td><td>${yes(env.sharedArrayBuffer)} / ${yes(env.atomicsWaitAsync)}</td></tr>
    <tr><td>OPFS available</td><td>${env.opfs ? yes(true) : `<span class="bad">STORAGE UNAVAILABLE</span> ${escapeHtml(env.opfsError ?? '')}`}</td></tr>
    <tr><td>Installed (standalone)</td><td>${yes(env.standalone)}</td></tr>
    <tr><td>storage.persisted() before / persist() / after</td><td>${env.persistError ? escapeHtml(env.persistError) : `${env.persistedBefore} / <b>${env.persistResult}</b> / ${env.persistedAfter}`}</td></tr>
    <tr><td>storage.estimate()</td><td>${env.estimate ? `usage ${env.estimate.usageMB} MB of quota ${env.estimate.quotaMB} MB` : escapeHtml(env.estimateError ?? '?')}</td></tr>
    <tr><td>Web Locks</td><td>${yes(env.webLocks)}</td></tr>
    <tr><td>User agent</td><td class="muted">${escapeHtml(env.userAgent)}</td></tr>`;
  if (probes) {
    for (const p of probes) {
      html += `<tr><td>${escapeHtml(VFS_LABEL[p.vfs as VfsName])}</td><td>${p.ok ? `<span class="ok">works</span> (open ${p.initMs} ms, SQLite ${p.sqlite}, FTS5 ${p.fts5 ? 'yes' : 'NO'})` : `<span class="bad">fails</span> ${escapeHtml(p.error)}`}</td></tr>`;
    }
  } else html += '<tr><td>Storage layers</td><td>probing…</td></tr>';
  $('env').innerHTML = html + '</table>';
  if (!env.opfs) log('Storage unavailable: OPFS cannot be used here (private browsing?). Nothing can be saved.', 'bad');
}

// ---------------------------------------------------------------- operations

function currentOpts(): OpenOpts {
  return {
    vfs: ($('vfs') as HTMLSelectElement).value as VfsName,
    profile: ($('profile') as HTMLSelectElement).value as PragmaProfile,
    lock: ($('lock') as HTMLSelectElement).value as 'exclusive' | 'none',
  };
}
const batchMs = () => Number(($('batch') as HTMLInputElement).value) || 0;

async function envReport(withProbes = true) {
  const env = await environment();
  renderEnv(env);
  record(null, 'environment', env);
  if (!withProbes) return { env, probes: null };
  const probes: any[] = [];
  if (env.opfs) for (const v of ALL_VFS) probes.push(await probe(v));
  else for (const v of ALL_VFS) probes.push({ vfs: v, ok: false, error: 'OPFS unavailable' });
  renderEnv(env, probes);
  record(null, 'probes', probes);
  if (!probes.some((p) => p.ok)) log('Storage unavailable: no storage layer can open a database here (private browsing?). Nothing can be saved.', 'bad');
  return { env, probes };
}

async function openDb(opts: OpenOpts = currentOpts()) {
  if (client) {
    try {
      await client.call('close');
    } catch {
      /* ignore */
    }
    client.terminate();
    client = null;
  }
  const c = new Client(opts);
  c.onStatus = (m) => {
    if (m.state === 'waiting-for-lock') {
      $('dbstate').innerHTML = '<span class="warn">Another tab holds this database. Waiting for it to close (read-only until then).</span>';
      log('waiting for the Web Lock held by another tab');
    } else if (m.type === 'flush-error') {
      state.lastError = m.error;
      flushErrors++;
      log(`write batch failed (${flushErrors}), will retry: ${m.error}`, 'bad');
      // A storage handle that died (for example after a long suspension) does not come back
      // by retrying. During a kill test, reload: the page then verifies and resumes by itself.
      if (flushErrors >= 3 && killRunning) {
        const k = loadJson<any>(KILL_KEY, {});
        k.note = 'auto-reload after write error: ' + m.error;
        saveJson(KILL_KEY, k);
        location.reload();
      }
    }
  };
  const info = await c.init();
  await c.call('config', { batchMs: batchMs() });
  client = c;
  const nodes = (await c.call('sql', { sql: 'SELECT COUNT(*) FROM nodes' }))[0][0];
  $('dbstate').innerHTML = `Open: <b>${VFS_LABEL[opts.vfs]}</b>, ${info.library}, journal ${info.journalMode}, sync ${info.synchronous}, FTS5 ${info.fts5 ? 'yes' : 'NO'}, ${nodes ? nodes + ' nodes' : 'empty (create the fixture)'}; opened in ${ms(info.timings.initTotalMs)}${info.timings.lockWaitMs > 50 ? `, waited ${ms(info.timings.lockWaitMs)} for the lock` : ''}`;
  record(opts.vfs, 'info', { ...info, compileOptions: undefined, fts5: info.fts5 });
  state.ready = true;
  return info;
}

async function ensureOpen() {
  if (!client || client.opts.vfs !== currentOpts().vfs) await openDb();
  return client!;
}

async function ensureFixture() {
  const c = await ensureOpen();
  const nodes = (await c.call('sql', { sql: 'SELECT COUNT(*) FROM nodes' }))[0][0];
  if (!nodes) await importFixture();
  return c;
}

async function importFixture() {
  const c = await ensureOpen();
  log('creating fixture…');
  const r = await c.call('import');
  record(c.opts.vfs, 'import', r);
  log(`fixture: ${r.words} words, ${r.scenes} scenes in ${ms(r.timings.importWithoutGenerateMs)}; file ${mb(r.sizes.fileBytes)}`);
  return r;
}

async function sizesNow() {
  const c = await ensureOpen();
  const r = await c.call('sizes');
  record(c.opts.vfs, 'sizes', r);
  log(`file ${mb(r.fileBytes)}; states ${mb(r.payload.docStateBytes)}, update log ${mb(r.payload.updateLogBytes)}, word index ${mb(r.payload.wordIndexBytes)}, trigram index ${mb(r.payload.trigramIndexBytes)}`);
  return r;
}

async function coldOpen() {
  const opts = currentOpts();
  if (client) {
    await client.call('close').catch(() => {});
    client.terminate();
    client = null;
  }
  const { client: c, result } = await openProject(opts);
  client = c;
  await c.call('config', { batchMs: batchMs() });
  record(opts.vfs, 'open', result);
  const docLoad = await docLoadTimes(c);
  record(opts.vfs, 'docLoad', docLoad);
  log(`tree in ${ms(result.treeLoadedMs)}, first document ${ms(result.firstDocMs)}`);
  return { open: result, docLoad };
}

async function typing(seconds: number, key?: string, extra: Record<string, unknown> = {}, scene = TYPING_SCENE, intervalMs = 100) {
  const c = await ensureFixture();
  await c.call('config', { batchMs: batchMs(), ...extra });
  const before = await c.call('sizes');
  stopTyping = false;
  state.running = true;
  const wake = await (navigator as any).wakeLock?.request('screen').catch(() => null);
  const r: any = await typingRun(c, {
    sceneIndex: scene,
    seconds,
    intervalMs,
    onTick: showCounter,
    shouldStop: () => stopTyping,
  });
  state.running = false;
  await wake?.release().catch(() => {});
  r.screenWakeLock = !!wake;
  r.batchIntervalMs = batchMs();
  r.sizeBefore = { fileBytes: before.fileBytes, updateLogBytes: before.payload.updateLogBytes, updateLogRows: before.payload.updateLogRows, docStateBytes: before.payload.docStateBytes };
  const after = await c.call('sizes');
  r.sizeAfterTyping = { fileBytes: after.fileBytes, updateLogBytes: after.payload.updateLogBytes, updateLogRows: after.payload.updateLogRows, docStateBytes: after.payload.docStateBytes };
  const docId = r.docId;
  r.compactAfterRun = await c.call('compact', { docId });
  const compacted = await c.call('sizes');
  r.sizeAfterCompaction = { fileBytes: compacted.fileBytes, freeBytes: compacted.freeBytes, updateLogBytes: compacted.payload.updateLogBytes, updateLogRows: compacted.payload.updateLogRows, docStateBytes: compacted.payload.docStateBytes };
  record(c.opts.vfs, key ?? `typing${seconds}s`, r);
  log(`typed ${r.changes} changes: batch p95 ${ms(r.workerBatchMs.p95)}, durable lag p95 ${ms(r.mainAckLagMs.p95)}`);
  return r;
}

async function verifyNow(scene = KILL_SCENE) {
  const c = await ensureOpen();
  const v = await verifyScene(c, scene);
  log(`verify: recovered ${v.durableSeq} changes, text ${v.textMatch ? 'intact' : 'MISMATCH'}, database ${v.integrity}`, v.ok ? 'ok' : 'bad');
  return v;
}

async function search() {
  const c = await ensureFixture();
  const r = await searchAll(c);
  record(c.opts.vfs, 'search', r);
  log(`search: word ${ms(r.wordCommon.top20WithSnippet.median)}, phrase ${ms(r.phrase.top20WithSnippet.median)}, regex ${ms(r.regexScan.allHits.median)}`);
  return r;
}

async function snapshots() {
  const c = await ensureFixture();
  const r = await snapshotRestore(c);
  record(c.opts.vfs, 'snapshots', r);
  log(`snapshot ${ms(r.typicalScene.snapshotMs.median)}, restore ${ms(r.typicalScene.restoreReplaceAndReloadMs.median)}`);
  return r;
}

async function compaction() {
  const c = await ensureFixture();
  const r = await compactionCurve(c);
  record(c.opts.vfs, 'compaction', r);
  log('compaction curve recorded');
  return r;
}

async function ftsVariants() {
  const c = await ensureFixture();
  const r = await c.call('ftsVariants');
  record(c.opts.vfs, 'ftsVariants', r);
  log('index size variants recorded');
  return r;
}

async function wipe() {
  if (client) {
    client.terminate();
    client = null;
  }
  state.ready = false;
  await new Promise((r) => setTimeout(r, 200));
  const r = await wipeAll();
  localStorage.removeItem(KILL_KEY);
  $('dbstate').textContent = 'No database open.';
  log(`deleted ${r.removed.length} OPFS entries${r.failed.length ? `, could not delete ${r.failed.join(', ')}` : ''}`);
  return r;
}

async function runAll() {
  await ensureFixture();
  await sizesNow();
  await coldOpen();
  await search();
  await typing(300, 'typing300s', { autoCompact: false });
  await compaction();
  await snapshots();
  await ftsVariants();
  log('all measurements done', 'ok');
}

// ---------------------------------------------------------------- kill test

function showCounter(sent: number, durable: number) {
  state.sent = sent;
  state.durable = durable;
  $('counter').firstChild!.textContent = `sent ${sent} / durable ${durable}`;
  $('counter-sub').textContent = `not yet durable: ${sent - durable} change(s) = ${(sent - durable) * (killRunning ? killInterval : 100)} ms of typing`;
  if (killRunning) {
    const k = loadJson<any>(KILL_KEY, {});
    k.sent = sent;
    k.durable = durable;
    k.sentAt = Date.now();
    saveJson(KILL_KEY, k);
  }
}

let killInterval = Number(params.get('interval')) || 100;

async function killStart(resume = false, intervalMs = killInterval) {
  killInterval = intervalMs;
  const opts = currentOpts();
  const c = await ensureFixture();
  const prev = loadJson<any>(KILL_KEY, {});
  saveJson(KILL_KEY, { ...prev, note: ($('kill-note') as HTMLSelectElement).value, active: true, vfs: opts.vfs, profile: opts.profile, lock: opts.lock, batchMs: batchMs(), intervalMs, startedAt: Date.now() });
  await c.call('config', { batchMs: batchMs(), autoCompact: true });
  killRunning = true;
  stopTyping = false;
  state.running = true;
  log(resume ? 'kill test: typing resumed' : 'kill test: typing started. Force-quit the app now and reopen it.', 'warn');
  await typingRun(c, { sceneIndex: KILL_SCENE, seconds: 1e7, intervalMs, onTick: showCounter, shouldStop: () => stopTyping });
  state.running = false;
  killRunning = false;
}

function killStop() {
  stopTyping = true;
  const k = loadJson<any>(KILL_KEY, {});
  k.active = false;
  saveJson(KILL_KEY, k);
  log('kill test stopped');
}

/** Runs at page load when a kill test was active: verify, record, resume. */
async function killResume(k: any) {
  ($('vfs') as HTMLSelectElement).value = k.vfs;
  ($('profile') as HTMLSelectElement).value = k.profile ?? 'tuned';
  ($('lock') as HTMLSelectElement).value = k.lock ?? 'exclusive';
  ($('batch') as HTMLInputElement).value = String(k.batchMs ?? 250);
  killInterval = k.intervalMs ?? 100;
  const rows: any[] = loadJson(KILLLOG_KEY, []);
  const entry: any = {
    n: rows.filter((r) => r.vfs === k.vfs).length + 1,
    at: new Date().toISOString(),
    vfs: k.vfs,
    mode: mode(),
    note: k.note ?? ($('kill-note') as HTMLSelectElement).value,
    lastSent: k.sent ?? null,
    lastDurableSeen: k.durable ?? null,
    hiddenAt: k.hiddenAt ?? null,
    sentWhenHidden: k.sentWhenHidden ?? null,
    msSinceLastSend: k.sentAt ? Date.now() - k.sentAt : null,
  };
  const t0 = performance.now();
  try {
    await openDb(currentOpts());
    entry.reopenMs = Math.round(performance.now() - t0);
    const v = await verifyScene(client!, KILL_SCENE);
    Object.assign(entry, {
      recovered: v.durableSeq,
      textMatch: v.textMatch,
      contiguous: v.contiguous,
      integrityOk: v.integrityOk,
      integrity: v.integrity,
      fts: v.fts,
      ok: v.ok,
      // A page-side lower bound: localStorage may itself lag behind at the moment of a kill.
      lostChanges: Math.max(0, (k.sent ?? v.durableSeq) - v.durableSeq),
      ackedButMissing: Math.max(0, (k.durable ?? 0) - v.durableSeq),
      verifyMs: v.verifyMs,
    });
    if (entry.ackedButMissing > 0) entry.ok = false;
  } catch (e: any) {
    Object.assign(entry, { ok: false, integrityOk: false, textMatch: false, error: String(e?.message ?? e) });
  }
  rows.push(entry);
  saveJson(KILLLOG_KEY, rows);
  if (String(k.note ?? '').startsWith('auto-reload')) {
    k.note = ($('kill-note') as HTMLSelectElement).value;
    saveJson(KILL_KEY, k);
  } else if (k.note) ($('kill-note') as HTMLSelectElement).value = k.note;
  renderKillLog();
  (window as any).spike.lastKillEntry = entry;
  log(
    entry.ok
      ? `reopen #${entry.n}: recovered ${entry.recovered} of ${entry.lastSent} sent; lost ${entry.lostChanges} change(s) = ${entry.lostChanges * 100} ms; database intact`
      : `reopen #${entry.n}: PROBLEM ${entry.error ?? entry.integrity ?? ''} textMatch=${entry.textMatch}`,
    entry.ok && entry.lostChanges <= 10 ? 'ok' : 'bad',
  );
  if (entry.ok && !params.has('noresume')) {
    await new Promise((r) => setTimeout(r, 1500));
    void guarded(() => killStart(true), true);
  }
}

// ---------------------------------------------------------------- wiring

async function guarded<T>(fn: () => Promise<T>, allowWhileBusy = false): Promise<T | undefined> {
  if (busy && !allowWhileBusy) {
    log('busy; wait for the current operation');
    return undefined;
  }
  busy = true;
  try {
    return await fn();
  } catch (e: any) {
    state.lastError = String(e?.message ?? e);
    log('ERROR: ' + state.lastError, 'bad');
    throw e;
  } finally {
    busy = false;
  }
}

function bind(id: string, fn: () => Promise<unknown>) {
  $(id).addEventListener('click', () => void guarded(fn).catch(() => {}));
}

bind('btn-env', () => envReport(true));
bind('btn-open', () => openDb());
bind('btn-import', importFixture);
bind('btn-sizes', sizesNow);
bind('btn-cold', coldOpen);
bind('btn-search', search);
bind('btn-typing', () => typing(300, 'typing300s', { autoCompact: false }));
bind('btn-typing-short', () => typing(30, 'typing30s', { autoCompact: false }));
bind('btn-compact', compaction);
bind('btn-snap', snapshots);
bind('btn-fts', ftsVariants);
bind('btn-all', runAll);
$('btn-verify').addEventListener('click', () => void guarded(() => verifyNow(), true).catch(() => {}));
bind('btn-kill-start', () => killStart(false));
$('btn-kill-stop').addEventListener('click', killStop);
$('kill-note').addEventListener('change', () => {
  const k = loadJson<any>(KILL_KEY, {});
  k.note = ($('kill-note') as HTMLSelectElement).value;
  saveJson(KILL_KEY, k);
});
$('btn-kill-clear').addEventListener('click', () => {
  localStorage.removeItem(KILLLOG_KEY);
  renderKillLog();
});
$('btn-clear-results').addEventListener('click', () => {
  results = {};
  saveJson(RESULTS_KEY, results);
  renderResults();
});
$('btn-wipe').addEventListener('click', () => {
  if (confirm('Delete all stored data for this page?')) void guarded(wipe, true).catch(() => {});
});
$('btn-copy').addEventListener('click', async () => {
  const text = JSON.stringify({ results, killLog: loadJson(KILLLOG_KEY, []) }, null, 1);
  try {
    await navigator.clipboard.writeText(text);
    log('results copied to the clipboard', 'ok');
  } catch {
    const sel = getSelection()!;
    sel.selectAllChildren($('results'));
    log('clipboard blocked; the results block is selected, copy it by hand', 'warn');
  }
});

// Flush as soon as the page is hidden: the last chance before a background kill.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    client?.worker.postMessage({ id: 0, op: 'flush' });
    if (killRunning) {
      const k = loadJson<any>(KILL_KEY, {});
      k.hiddenAt = Date.now();
      k.sentWhenHidden = state.sent;
      saveJson(KILL_KEY, k);
    }
  }
});

(window as any).spike = {
  state,
  envReport,
  probe,
  openDb,
  importFixture,
  sizesNow,
  coldOpen,
  typing,
  verifyNow,
  search,
  snapshots,
  compaction,
  ftsVariants,
  wipe,
  killStart,
  killStop,
  runAll,
  call: (op: string, args?: unknown) => client!.call(op, args),
  setOpts(o: { vfs?: VfsName; profile?: PragmaProfile; lock?: string; batchMs?: number }) {
    if (o.vfs) ($('vfs') as HTMLSelectElement).value = o.vfs;
    if (o.profile) ($('profile') as HTMLSelectElement).value = o.profile;
    if (o.lock) ($('lock') as HTMLSelectElement).value = o.lock;
    if (o.batchMs !== undefined) ($('batch') as HTMLInputElement).value = String(o.batchMs);
  },
  results: () => results,
  killLog: () => loadJson(KILLLOG_KEY, []),
  lastKillEntry: null as any,
  bootDone: false,
};

async function boot() {
  renderResults();
  renderKillLog();
  for (const [k, id] of [['vfs', 'vfs'], ['profile', 'profile'], ['lock', 'lock'], ['batch', 'batch']]) {
    if (params.has(k)) ($(id) as HTMLInputElement).value = params.get(k)!;
  }
  const appName = crossOriginIsolated ? 'B isolated' : 'B plain';
  document.title = appName;
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', appName);
  $('banner').innerHTML = `Mode: <b>${crossOriginIsolated ? 'cross-origin isolated' : 'not cross-origin isolated'}</b> (${escapeHtml(location.pathname)})`;
  const k = loadJson<any>(KILL_KEY, {});
  try {
    if (k.active && !params.has('nokill')) {
      await envReport(false);
      await guarded(() => killResume(k));
    } else if (params.has('autoopen')) {
      await envReport(false);
      await guarded(coldOpen);
    } else if (params.has('kill')) {
      await envReport(false);
      void guarded(() => killStart(false)).catch(() => {});
    } else {
      await envReport(!params.has('noprobe'));
    }
  } catch (e: any) {
    state.lastError = String(e?.message ?? e);
  }
  (window as any).spike.bootDone = true;
}
void boot();
