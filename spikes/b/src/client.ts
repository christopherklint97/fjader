// Main-thread side: worker RPC and the measured operations.
import * as Y from 'yjs';
import type { PragmaProfile, VfsName } from './db';
import { applyTypingChange, docFromParagraphs, docFromState, docText, TYPING_CLIENT } from './ydoc';
import { BIG_SCENE_INDEX, NEEDLES, sceneId } from '../../shared/fixture-b';

export interface OpenOpts {
  vfs: VfsName;
  name?: string;
  profile?: PragmaProfile;
  lock?: 'exclusive' | 'none';
}

export function summarise(xs: number[]) {
  if (!xs.length) return { n: 0, median: 0, p95: 0, p99: 0, max: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const r = (x: number) => Math.round(x * 100) / 100;
  return { n: s.length, median: r(at(0.5)), p95: r(at(0.95)), p99: r(at(0.99)), max: r(s[s.length - 1]) };
}

export class Client {
  worker: Worker;
  private nextId = 1;
  private waiting = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  onDurable: (m: { docId: string; seq: number; batchMs: number; n: number; ageMs: number }) => void = () => {};
  onStatus: (m: any) => void = () => {};
  createdAt = performance.now();
  bootMsgAt = 0;
  info: any = null;

  constructor(public opts: OpenOpts) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'reply') {
        const w = this.waiting.get(m.id);
        if (!w) return;
        this.waiting.delete(m.id);
        if (m.error) w.reject(Object.assign(new Error(m.error), { code: m.code, errName: m.name }));
        else w.resolve(m.result);
      } else if (m.type === 'durable') this.onDurable(m);
      else if (m.type === 'boot') this.bootMsgAt = performance.now();
      else this.onStatus(m);
    };
    this.worker.onerror = (e) => {
      const err = new Error('worker error: ' + (e.message || 'failed to load'));
      for (const w of this.waiting.values()) w.reject(err);
      this.waiting.clear();
    };
  }

  call<T = any>(op: string, args?: any): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ id, op, args });
    });
  }

  async init() {
    this.info = await this.call('init', this.opts);
    return this.info;
  }

  push(docId: string, seq: number, update: Uint8Array) {
    this.worker.postMessage({ type: 'push', docId, seq, ts: Date.now(), update });
  }

  terminate() {
    this.worker.terminate();
  }
}

export async function loadDocInto(c: Client, docId: string, clientID?: number) {
  const t0 = performance.now();
  const r = await c.call('loadDoc', { docId });
  const t1 = performance.now();
  const doc = docFromState(r.state, r.updates, clientID);
  const t2 = performance.now();
  return {
    doc,
    durableSeq: r.durableSeq as number,
    stateSeq: r.stateSeq as number,
    contiguous: r.contiguous as boolean,
    pendingUpdates: r.updates.length as number,
    stateBytes: (r.state as Uint8Array).byteLength,
    workerQueryMs: r.queryMs as number,
    roundTripMs: t1 - t0,
    applyMs: t2 - t1,
    totalMs: t2 - t0,
  };
}

// ---------------------------------------------------------------- environment

export async function environment() {
  const nav: any = navigator;
  const out: any = {
    userAgent: nav.userAgent,
    standalone: nav.standalone === true || matchMedia('(display-mode: standalone)').matches,
    secureContext: isSecureContext,
    crossOriginIsolated: crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    atomicsWaitAsync: typeof (Atomics as any)?.waitAsync === 'function',
    webLocks: !!nav.locks,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory ?? null,
    url: location.pathname,
  };
  try {
    const root = await nav.storage.getDirectory();
    out.opfs = true;
    out.opfsEntries = [];
    for await (const name of (root as any).keys()) out.opfsEntries.push(name);
  } catch (e: any) {
    out.opfs = false;
    out.opfsError = `${e?.name}: ${e?.message}`;
  }
  try {
    out.persistedBefore = await nav.storage.persisted();
    out.persistResult = await nav.storage.persist();
    out.persistedAfter = await nav.storage.persisted();
  } catch (e: any) {
    out.persistError = `${e?.name}: ${e?.message}`;
  }
  try {
    const est = await nav.storage.estimate();
    out.estimate = { usage: est.usage, quota: est.quota, usageMB: +(est.usage / 1e6).toFixed(2), quotaMB: Math.round(est.quota / 1e6) };
  } catch (e: any) {
    out.estimateError = `${e?.name}: ${e?.message}`;
  }
  return out;
}

/** Can this storage layer open, write, read back and close a database here? */
export async function probe(vfs: VfsName): Promise<{ vfs: VfsName; ok: boolean; error?: string; initMs?: number; fts5?: boolean; sqlite?: string }> {
  const c = new Client({ vfs, name: 'spikeb-probe', profile: 'default', lock: 'none' });
  try {
    const info: any = await Promise.race([
      c.init(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout after 20 s')), 20000)),
    ]);
    const stamp = Date.now();
    await c.call('sql', { sql: 'INSERT OR REPLACE INTO meta(k, v) VALUES(?, ?)', params: ['probe', stamp] });
    const rows = await c.call('sql', { sql: 'SELECT v FROM meta WHERE k=?', params: ['probe'] });
    await c.call('close');
    if (rows[0][0] !== stamp) throw new Error('read back a different value');
    return { vfs, ok: true, initMs: Math.round(info.timings.initTotalMs), fts5: info.fts5, sqlite: info.sqliteVersion };
  } catch (e: any) {
    return { vfs, ok: false, error: String(e?.message ?? e) };
  } finally {
    c.terminate();
  }
}

/** Delete every file this origin holds in OPFS (all storage layers). */
export async function wipeAll(): Promise<{ removed: string[]; failed: string[] }> {
  const root: any = await navigator.storage.getDirectory();
  const removed: string[] = [];
  let failed: string[] = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    failed = [];
    const names: string[] = [];
    for await (const name of root.keys()) names.push(name);
    for (const name of names) {
      try {
        await root.removeEntry(name, { recursive: true });
        removed.push(name);
      } catch {
        failed.push(name);
      }
    }
    if (!failed.length) break;
    await new Promise((r) => setTimeout(r, 300)); // handles of a terminated worker are released asynchronously
  }
  return { removed, failed };
}

// ---------------------------------------------------------------- open project

export async function openProject(opts: OpenOpts, firstScene = 2) {
  const t0 = performance.now();
  const c = new Client(opts);
  const info = await c.init();
  const tInit = performance.now();
  const tree = await c.call('tree');
  const tTree = performance.now();
  const first = await loadDocInto(c, sceneId(firstScene));
  const text = docText(first.doc);
  const tDoc = performance.now();
  return {
    client: c,
    result: {
      treeRows: tree.rows.length,
      workerStartToInitMs: info.timings.workerBootToInitMs,
      initBreakdown: info.timings,
      initDoneMs: tInit - t0,
      treeLoadedMs: tTree - t0,
      treeQueryMs: tree.queryMs,
      treeRoundTripMs: tTree - tInit,
      firstDocMs: tDoc - tTree,
      firstDocChars: text.length,
      pageClockAtTreeMs: tTree,
      pageClockAtDocMs: tDoc,
    },
  };
}

export async function docLoadTimes(c: Client) {
  const times: number[] = [];
  const worker: number[] = [];
  for (let i = 0; i < 40; i++) {
    const idx = (i * 37 + 11) % 600;
    if (idx === BIG_SCENE_INDEX) continue;
    const r = await loadDocInto(c, sceneId(idx));
    docText(r.doc);
    r.doc.destroy();
    times.push(r.totalMs);
    worker.push(r.workerQueryMs);
  }
  const big: number[] = [];
  let bigBytes = 0;
  for (let i = 0; i < 5; i++) {
    const r = await loadDocInto(c, sceneId(BIG_SCENE_INDEX));
    docText(r.doc);
    r.doc.destroy();
    big.push(r.totalMs);
    bigBytes = r.stateBytes;
  }
  const cpuCalibrationMs = (await c.call('calibrate')).ms;
  return { typicalDocMs: summarise(times), typicalWorkerQueryMs: summarise(worker), bigDocMs: summarise(big), bigDocStateBytes: bigBytes, cpuCalibrationMs };
}

// ---------------------------------------------------------------- typing

export interface TypingOpts {
  sceneIndex: number;
  seconds: number;
  intervalMs?: number;
  onTick?: (sent: number, durable: number) => void;
  shouldStop?: () => boolean;
}

export async function typingRun(c: Client, o: TypingOpts) {
  const interval = o.intervalMs ?? 100;
  const docId = sceneId(o.sceneIndex);
  const loaded = await loadDocInto(c, docId, TYPING_CLIENT);
  const doc = loaded.doc;
  let seq = loaded.durableSeq;
  const startSeq = seq;
  let durable = seq;
  const sentAt = new Map<number, number>();
  const ackLag: number[] = [];
  const mainCost: number[] = [];
  const drift: number[] = [];
  const updateBytes: number[] = [];
  doc.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== 'typing') return;
    updateBytes.push(u.byteLength);
    c.push(docId, seq, u);
  });
  c.onDurable = (m) => {
    if (m.docId !== docId) return;
    const t = performance.now();
    for (let s = durable + 1; s <= m.seq; s++) {
      const at = sentAt.get(s);
      if (at !== undefined) ackLag.push(t - at);
      sentAt.delete(s);
    }
    durable = m.seq;
    o.onTick?.(seq, durable);
  };
  await c.call('stats'); // reset worker-side counters
  const cal: number[] = [(await c.call('calibrate')).ms];
  const calTimer = setInterval(() => void c.call('calibrate').then((r) => cal.push(r.ms)), 5000);
  const start = performance.now();
  const total = Math.round((o.seconds * 1000) / interval);
  await new Promise<void>((resolve) => {
    let k = 0;
    const tick = () => {
      if (k >= total || o.shouldStop?.()) return resolve();
      const due = start + k * interval;
      const t0 = performance.now();
      drift.push(t0 - due);
      seq++;
      applyTypingChange(doc, seq);
      sentAt.set(seq, performance.now());
      mainCost.push(performance.now() - t0);
      o.onTick?.(seq, durable);
      k++;
      setTimeout(tick, Math.max(0, start + k * interval - performance.now()));
    };
    tick();
  });
  const elapsed = performance.now() - start;
  clearInterval(calTimer);
  await c.call('flush');
  const stats = await c.call('stats');
  const after = await loadDocInto(c, docId);
  const same = docText(after.doc) === docText(doc);
  after.doc.destroy();
  doc.destroy();
  c.onDurable = () => {};
  return {
    docId,
    changes: seq - startSeq,
    elapsedMs: Math.round(elapsed),
    intervalMs: interval,
    durableSeq: after.durableSeq,
    storedEqualsLive: same,
    workerBatchMs: stats.batchMs,
    workerBatchSize: stats.batchN,
    oldestChangeAgeAtCommitMs: stats.ageMs,
    compactions: stats.compactMs,
    flushErrors: stats.flushErrors,
    mainAckLagMs: summarise(ackLag),
    mainPerChangeMs: summarise(mainCost),
    mainTimerDriftMs: summarise(drift),
    updateBytes: summarise(updateBytes),
    cpuCalibrationMs: summarise(cal),
  };
}

/** Rebuild the expected text by replaying changes 1..n on the fixture scene and compare. */
export async function verifyScene(c: Client, sceneIndex: number) {
  const t0 = performance.now();
  const integrity = await c.call('integrity');
  const loaded = await loadDocInto(c, sceneId(sceneIndex), TYPING_CLIENT);
  const base = await c.call('fixtureScene', { index: sceneIndex });
  const replay = docFromParagraphs(base.paragraphs);
  replay.clientID = TYPING_CLIENT;
  for (let i = 1; i <= loaded.durableSeq; i++) applyTypingChange(replay, i);
  const textMatch = docText(replay) === docText(loaded.doc);
  replay.destroy();
  loaded.doc.destroy();
  return {
    durableSeq: loaded.durableSeq,
    stateSeq: loaded.stateSeq,
    pendingUpdates: loaded.pendingUpdates,
    contiguous: loaded.contiguous,
    textMatch,
    integrityOk: integrity.ok as boolean,
    integrity: integrity.integrityCheck as string,
    fts: integrity.fts as string,
    ok: textMatch && loaded.contiguous && integrity.ok,
    verifyMs: Math.round(performance.now() - t0),
  };
}

// ---------------------------------------------------------------- search

export async function searchAll(c: Client) {
  const out: Record<string, any> = {};
  out.cpuCalibrationMs = (await c.call('calibrate')).ms;
  out.wordCommon = await c.call('search', { kind: 'word', q: NEEDLES.commonWord.q });
  out.wordRare = await c.call('search', { kind: 'word', q: NEEDLES.rareWord.q });
  out.phrase = await c.call('search', { kind: 'phrase', q: NEEDLES.phrase.q });
  out.substringTrigram = await c.call('search', { kind: 'substring', q: NEEDLES.substring.q });
  out.substringLikeScan = await c.call('search', { kind: 'like', q: NEEDLES.substring.q });
  out.regexScan = await c.call('search', { kind: 'regex', q: NEEDLES.regex.source, flags: NEEDLES.regex.flags });
  out.expected = {
    wordRare: NEEDLES.rareWord.scenes.length,
    phrase: NEEDLES.phrase.scenes.length,
    substring: NEEDLES.substring.scenes.length,
    regexDocs: new Set([...NEEDLES.rareWord.scenes, ...NEEDLES.phrase.scenes]).size,
  };
  out.hitsCorrect =
    out.wordRare.hits === out.expected.wordRare &&
    out.phrase.hits === out.expected.phrase &&
    out.substringTrigram.hits === out.expected.substring &&
    out.substringLikeScan.hits === out.expected.substring &&
    out.regexScan.hits === out.expected.regexDocs;
  return out;
}

// ---------------------------------------------------------------- snapshots

async function burst(c: Client, sceneIndex: number, n: number) {
  const docId = sceneId(sceneIndex);
  const loaded = await loadDocInto(c, docId, TYPING_CLIENT);
  let seq = loaded.durableSeq;
  loaded.doc.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin === 'typing') c.push(docId, seq, u);
  });
  for (let i = 0; i < n; i++) {
    seq++;
    applyTypingChange(loaded.doc, seq);
  }
  await c.call('flush');
  const text = docText(loaded.doc);
  loaded.doc.destroy();
  return text;
}

export async function snapshotRestore(c: Client) {
  await c.call('config', { autoCompact: false });
  const out: Record<string, any> = {};
  out.cpuCalibrationMs = (await c.call('calibrate')).ms;
  for (const [label, idx] of [
    ['typicalScene', 30],
    ['bigScene', BIG_SCENE_INDEX],
  ] as const) {
    const docId = sceneId(idx);
    const snapMs: number[] = [];
    const snapWorkerMs: number[] = [];
    const replaceMs: number[] = [];
    const forwardMs: number[] = [];
    let forwardBytes = 0;
    let ok = true;
    let snapBytes = 0;
    for (let i = 0; i < 5; i++) {
      const before = docText((await loadDocInto(c, docId)).doc);
      let t = performance.now();
      const s1 = await c.call('snapshot', { docId, label: 'spike' });
      snapMs.push(performance.now() - t);
      snapWorkerMs.push(s1.ms);
      snapBytes = s1.bytes;
      await burst(c, idx, 100);
      t = performance.now();
      await c.call('restore', { snapshotId: s1.id, mode: 'replace' });
      const r1 = await loadDocInto(c, docId);
      const text1 = docText(r1.doc);
      replaceMs.push(performance.now() - t);
      if (text1 !== before) ok = false;
      // Snapshot with a pending update log, then restore as a forward update.
      await burst(c, idx, 100);
      const s2 = await c.call('snapshot', { docId, label: 'spike-pending' });
      const mid = docText((await loadDocInto(c, docId)).doc);
      await burst(c, idx, 100);
      t = performance.now();
      const f = await c.call('restore', { snapshotId: s2.id, mode: 'forward' });
      const r2 = await loadDocInto(c, docId);
      const text2 = docText(r2.doc);
      forwardMs.push(performance.now() - t);
      forwardBytes = f.updateBytes;
      if (text2 !== mid) ok = false;
      await c.call('compact', { docId });
    }
    out[label] = {
      snapshotBytes: snapBytes,
      snapshotMs: summarise(snapMs),
      snapshotWorkerMs: summarise(snapWorkerMs),
      restoreReplaceAndReloadMs: summarise(replaceMs),
      restoreForwardAndReloadMs: summarise(forwardMs),
      forwardUpdateBytes: forwardBytes,
      restoredTextCorrect: ok,
    };
  }
  const sizeBefore = await c.call('sizes');
  const t = performance.now();
  const all = await c.call('snapshotAll', { label: 'all' });
  out.snapshotAll = {
    ms: Math.round(performance.now() - t),
    workerMs: Math.round(all.ms),
    docs: all.docs,
    fileBytesBefore: sizeBefore.fileBytes,
    fileBytesAfter: (await c.call('sizes')).fileBytes,
  };
  await c.call('config', { autoCompact: true });
  return out;
}

// ---------------------------------------------------------------- compaction

export async function compactionCurve(c: Client) {
  await c.call('config', { autoCompact: false });
  const out: Record<string, any> = {};
  out.cpuCalibrationMs = (await c.call('calibrate')).ms;
  for (const [label, idx] of [
    ['typicalScene', 40],
    ['bigScene', BIG_SCENE_INDEX],
  ] as const) {
    const docId = sceneId(idx);
    await c.call('compact', { docId });
    const rows: any[] = [];
    for (const n of [100, 500, 1000, 3000]) {
      await burst(c, idx, n);
      const loads: number[] = [];
      let pending = 0;
      for (let i = 0; i < 5; i++) {
        const l = await loadDocInto(c, docId);
        loads.push(l.totalMs);
        pending = l.pendingUpdates;
        l.doc.destroy();
      }
      const comp = await c.call('compact', { docId });
      const loadsAfter: number[] = [];
      for (let i = 0; i < 5; i++) {
        const l = await loadDocInto(c, docId);
        loadsAfter.push(l.totalMs);
        l.doc.destroy();
      }
      rows.push({
        pendingUpdates: pending,
        loadWithLogMs: summarise(loads).median,
        loadAfterCompactMs: summarise(loadsAfter).median,
        logAndStateBytes: comp.bytesBefore,
        compactedBytes: comp.bytesAfter,
        mergeUpdatesBytes: comp.mergeUpdatesBytes,
        compactTotalMs: +comp.totalMs.toFixed(2),
        compactYjsMs: +comp.yjsDocMs.toFixed(2),
        compactReindexMs: +comp.reindexMs.toFixed(2),
        mergeUpdatesMs: +comp.yjsMergeUpdatesMs.toFixed(2),
      });
    }
    out[label] = rows;
  }
  await c.call('config', { autoCompact: true });
  return out;
}

export { Y };
