/// <reference lib="webworker" />
// The worker that owns the database. One connection, all work serialised.
import * as Y from 'yjs';
import { Cache, pragmasFor, type Db, type OpenInfo, type Param, type PragmaProfile, type VfsName } from './db';
import { openOfficial } from './backend-official';
import { openWa } from './backend-wa';
import { countWords, docFromParagraphs, docFromState, docParagraphs, docText, FRAG } from './ydoc';
import { generateProject, NEEDLES, type FixtureProject } from '../../shared/fixture-b';

declare const self: DedicatedWorkerGlobalScope;

const bootAt = performance.now();
let db: Db;
let q: Cache;
let vfsName: VfsName;
let project: FixtureProject | undefined;

const cfg = { batchMs: 250, compactCount: 500, compactBytes: 64 * 1024, autoCompact: true };

interface Pending {
  docId: string;
  seq: number;
  ts: number;
  update: Uint8Array;
}
const queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
const pendingLog = new Map<string, { count: number; bytes: number }>();
const stats = { batchMs: [] as number[], batchN: [] as number[], ageMs: [] as number[], compactMs: [] as number[], flushErrors: 0 };

// Everything that touches the database runs through this chain, so an RPC
// arriving mid-transaction (the wa-sqlite API is async) cannot interleave.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

const now = () => performance.now();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS nodes(
  id TEXT PRIMARY KEY, parent TEXT, ord TEXT NOT NULL, kind TEXT NOT NULL,
  title TEXT NOT NULL, words INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS nodes_parent ON nodes(parent, ord);
CREATE TABLE IF NOT EXISTS doc_state(
  doc_id TEXT PRIMARY KEY, seq INTEGER NOT NULL DEFAULT 0, state BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS doc_updates(
  doc_id TEXT NOT NULL, seq INTEGER NOT NULL, ts INTEGER NOT NULL, upd BLOB NOT NULL,
  PRIMARY KEY(doc_id, seq)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS snapshots(
  id INTEGER PRIMARY KEY, doc_id TEXT NOT NULL, created_at INTEGER NOT NULL,
  label TEXT, seq INTEGER NOT NULL DEFAULT 0, state BLOB NOT NULL);
CREATE INDEX IF NOT EXISTS snapshots_doc ON snapshots(doc_id, created_at);
CREATE TABLE IF NOT EXISTS doc_text(
  id INTEGER PRIMARY KEY, doc_id TEXT NOT NULL UNIQUE, seq INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(
  body, content='doc_text', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE IF NOT EXISTS search_tri USING fts5(
  body, content='doc_text', content_rowid='id', tokenize='trigram');
`;

async function one(sql: string, params?: Param[]): Promise<any> {
  const rows = await q.all(sql, params);
  return rows.length ? rows[0][0] : null;
}

async function tx<T>(fn: () => Promise<T>): Promise<T> {
  await q.run('BEGIN IMMEDIATE');
  try {
    const r = await fn();
    await q.run('COMMIT');
    return r;
  } catch (e) {
    try {
      await q.run('ROLLBACK');
    } catch {
      /* already rolled back */
    }
    throw e;
  }
}

// ---------------------------------------------------------------- init

async function acquireLock(name: string): Promise<number> {
  const t0 = now();
  await new Promise<void>((granted) => {
    const hold = () => {
      granted();
      return new Promise<void>(() => {}); // held until the worker dies
    };
    navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => {
      if (lock) return hold();
      self.postMessage({ type: 'status', state: 'waiting-for-lock', lock: name });
      void navigator.locks.request(name, { mode: 'exclusive' }, hold);
      return undefined;
    });
  });
  return now() - t0;
}

async function init(a: { vfs: VfsName; name?: string; profile?: PragmaProfile; lock?: 'exclusive' | 'none' }) {
  const t0 = now();
  vfsName = a.vfs;
  const name = a.name ?? 'spikeb';
  let lockWaitMs = 0;
  if (a.lock === 'exclusive') lockWaitMs = await acquireLock(`spikeb-lock-${name}-${a.vfs}`);
  let opened: { db: Db; info: OpenInfo };
  if (a.vfs === 'coop') opened = await openWa(name);
  else opened = await openOfficial(a.vfs, name);
  db = opened.db;
  q = new Cache(db);
  const tPragma = now();
  const pragmas = pragmasFor(a.vfs, a.profile ?? 'tuned');
  for (const p of pragmas) await db.exec(p);
  const tSchema = now();
  await db.exec(SCHEMA);
  const tDone = now();
  const compile = (await q.all('PRAGMA compile_options')).map((r) => String(r[0]));
  return {
    vfs: a.vfs,
    library: db.library,
    sqliteVersion: await one('SELECT sqlite_version()'),
    fts5: compile.includes('ENABLE_FTS5'),
    dbstat: compile.includes('ENABLE_DBSTAT_VTAB'),
    compileOptions: compile,
    journalMode: await one('PRAGMA journal_mode'),
    synchronous: await one('PRAGMA synchronous'),
    lockingMode: await one('PRAGMA locking_mode'),
    pageSize: await one('PRAGMA page_size'),
    pragmas,
    crossOriginIsolated: self.crossOriginIsolated,
    timings: {
      workerBootToInitMs: t0 - bootAt,
      lockWaitMs,
      ...opened.info,
      pragmaMs: tSchema - tPragma,
      schemaMs: tDone - tSchema,
      initTotalMs: tDone - t0,
    },
  };
}

// ---------------------------------------------------------------- import

function getProject(): FixtureProject {
  if (!project) project = generateProject();
  return project;
}

async function reindexText(docId: string, seq: number, body: string): Promise<void> {
  const old = await q.all('SELECT id, body FROM doc_text WHERE doc_id=?', [docId]);
  if (old.length) {
    const id = old[0][0] as number;
    const oldBody = old[0][1] as string;
    await q.run("INSERT INTO search(search, rowid, body) VALUES('delete', ?, ?)", [id, oldBody]);
    await q.run("INSERT INTO search_tri(search_tri, rowid, body) VALUES('delete', ?, ?)", [id, oldBody]);
    await q.run('UPDATE doc_text SET body=?, seq=? WHERE id=?', [body, seq, id]);
    await q.run('INSERT INTO search(rowid, body) VALUES(?, ?)', [id, body]);
    await q.run('INSERT INTO search_tri(rowid, body) VALUES(?, ?)', [id, body]);
  } else {
    await q.run('INSERT INTO doc_text(doc_id, seq, body) VALUES(?, ?, ?)', [docId, seq, body]);
    const id = (await one('SELECT id FROM doc_text WHERE doc_id=?', [docId])) as number;
    await q.run('INSERT INTO search(rowid, body) VALUES(?, ?)', [id, body]);
    await q.run('INSERT INTO search_tri(rowid, body) VALUES(?, ?)', [id, body]);
  }
}

async function importProject() {
  const t0 = now();
  const p = getProject();
  const tGen = now();
  let yjsMs = 0;
  let stateBytes = 0;
  let textBytes = 0;
  const existing = (await one('SELECT COUNT(*) FROM nodes')) as number;
  if (existing) throw new Error('database already holds a project; wipe first');
  const tSql0 = now();
  await q.run('BEGIN IMMEDIATE');
  let ci = 0;
  for (const ch of p.chapters) {
    const chWords = ch.scenes.reduce((a, s) => a + s.words, 0);
    await q.run('INSERT INTO nodes(id, parent, ord, kind, title, words) VALUES(?,?,?,?,?,?)', [
      ch.id,
      null,
      'a' + String(ci++).padStart(5, '0'),
      'chapter',
      ch.title,
      chWords,
    ]);
    let si = 0;
    for (const s of ch.scenes) {
      const ty = now();
      const doc = docFromParagraphs(s.paragraphs);
      const state = Y.encodeStateAsUpdate(doc);
      doc.destroy();
      yjsMs += now() - ty;
      const body = s.paragraphs.join('\n');
      stateBytes += state.byteLength;
      textBytes += body.length;
      await q.run('INSERT INTO nodes(id, parent, ord, kind, title, words) VALUES(?,?,?,?,?,?)', [
        s.id,
        ch.id,
        'a' + String(si++).padStart(5, '0'),
        'scene',
        s.title,
        s.words,
      ]);
      await q.run('INSERT INTO doc_state(doc_id, seq, state) VALUES(?, 0, ?)', [s.id, state]);
      await reindexText(s.id, 0, body);
    }
  }
  const tCommit0 = now();
  await q.run('COMMIT');
  const tCommit1 = now();
  const before = await sizes();
  const tOpt0 = now();
  await db.exec("INSERT INTO search(search) VALUES('optimize'); INSERT INTO search_tri(search_tri) VALUES('optimize');");
  const tOpt1 = now();
  // In WAL mode, fold the log back into the database and cut the file down; a no-op otherwise.
  await q.all('PRAGMA wal_checkpoint(TRUNCATE)');
  const tCkpt = now();
  const after = await sizes();
  return {
    scenes: p.sceneCount,
    chapters: p.chapters.length,
    words: p.totalWords,
    textBytes,
    stateBytes,
    timings: {
      generateMs: tGen - t0,
      yjsEncodeMs: yjsMs,
      sqlMs: tCommit0 - tSql0 - yjsMs,
      commitMs: tCommit1 - tCommit0,
      importTotalMs: tCommit1 - t0,
      importWithoutGenerateMs: tCommit1 - tGen,
      ftsOptimizeMs: tOpt1 - tOpt0,
      walCheckpointMs: tCkpt - tOpt1,
    },
    sizesBeforeOptimize: before,
    sizes: after,
  };
}

// ---------------------------------------------------------------- sizes

async function sizes() {
  const pageSize = (await one('PRAGMA page_size')) as number;
  const pageCount = (await one('PRAGMA page_count')) as number;
  const freelist = (await one('PRAGMA freelist_count')) as number;
  const sum = async (sql: string) => ((await one(sql)) as number) ?? 0;
  const out: Record<string, any> = {
    fileBytes: pageSize * pageCount,
    freeBytes: pageSize * freelist,
    pageSize,
    payload: {
      docStateBytes: await sum('SELECT SUM(LENGTH(state)) FROM doc_state'),
      docStateRows: await sum('SELECT COUNT(*) FROM doc_state'),
      updateLogBytes: await sum('SELECT SUM(LENGTH(upd)) FROM doc_updates'),
      updateLogRows: await sum('SELECT COUNT(*) FROM doc_updates'),
      plainTextBytes: await sum('SELECT SUM(LENGTH(CAST(body AS BLOB))) FROM doc_text'),
      wordIndexBytes: await sum('SELECT SUM(LENGTH(block)) FROM search_data'),
      trigramIndexBytes: await sum('SELECT SUM(LENGTH(block)) FROM search_tri_data'),
      snapshotBytes: await sum('SELECT SUM(LENGTH(state)) FROM snapshots'),
      snapshotRows: await sum('SELECT COUNT(*) FROM snapshots'),
    },
  };
  try {
    const rows = await q.all('SELECT name, SUM(pgsize) FROM dbstat GROUP BY name ORDER BY 2 DESC');
    const pages: Record<string, number> = {};
    for (const r of rows) pages[String(r[0])] = r[1] as number;
    const grp = (pred: (n: string) => boolean) =>
      Object.entries(pages).reduce((a, [n, b]) => (pred(n) ? a + b : a), 0);
    out.onDisk = {
      docState: grp((n) => n === 'doc_state' || n.startsWith('sqlite_autoindex_doc_state')),
      updateLog: grp((n) => n === 'doc_updates'),
      plainText: grp((n) => n === 'doc_text' || n.startsWith('sqlite_autoindex_doc_text')),
      wordIndex: grp((n) => /^search_(data|idx|docsize|config)$/.test(n)),
      trigramIndex: grp((n) => /^search_tri_(data|idx|docsize|config)$/.test(n)),
      snapshots: grp((n) => n === 'snapshots' || n === 'snapshots_doc'),
      tree: grp((n) => n === 'nodes' || n === 'nodes_parent'),
      other: grp((n) => n === 'sqlite_schema' || n === 'meta'),
    };
  } catch {
    out.onDisk = null; // dbstat not compiled in
  }
  try {
    const est = await navigator.storage.estimate();
    out.estimate = { usage: est.usage, quota: est.quota };
  } catch (e) {
    out.estimate = { error: String(e) };
  }
  return out;
}

/** Size of alternative FTS5 configurations, built from doc_text and dropped again. */
async function ftsVariants() {
  const variants: [string, string][] = [
    ['word detail=full', "tokenize='unicode61 remove_diacritics 2'"],
    ['word detail=column', "tokenize='unicode61 remove_diacritics 2', detail=column"],
    ['word detail=none', "tokenize='unicode61 remove_diacritics 2', detail=none"],
    ['trigram detail=full', "tokenize='trigram'"],
    ['trigram detail=column', "tokenize='trigram', detail=column"],
    ['trigram detail=none', "tokenize='trigram', detail=none"],
  ];
  const out: Record<string, any> = {};
  for (const [label, opts] of variants) {
    const t0 = now();
    await db.exec(`DROP TABLE IF EXISTS fts_var; CREATE VIRTUAL TABLE fts_var USING fts5(body, content='doc_text', content_rowid='id', ${opts});`);
    await db.exec("INSERT INTO fts_var(fts_var) VALUES('rebuild'); INSERT INTO fts_var(fts_var) VALUES('optimize');");
    const bytes = await one('SELECT SUM(LENGTH(block)) FROM fts_var_data');
    let substringMs: number | null = null;
    let substringHits: number | null = null;
    if (label.startsWith('trigram')) {
      const s0 = now();
      try {
        substringHits = (await one('SELECT COUNT(*) FROM fts_var WHERE body LIKE ?', ['%' + NEEDLES.substring.q + '%'])) as number;
        substringMs = now() - s0;
      } catch {
        substringHits = -1;
      }
    }
    out[label] = { bytes, buildMs: now() - t0, substringLikeMs: substringMs, substringHits };
  }
  await db.exec('DROP TABLE IF EXISTS fts_var');
  return out;
}

// ---------------------------------------------------------------- open, load

async function tree() {
  const t0 = now();
  const rows = await q.all('SELECT id, parent, ord, kind, title, words FROM nodes ORDER BY parent, ord');
  return { rows, queryMs: now() - t0 };
}

async function loadDoc(a: { docId: string }) {
  const t0 = now();
  const st = await q.all('SELECT seq, state FROM doc_state WHERE doc_id=?', [a.docId]);
  if (!st.length) throw new Error('no such document: ' + a.docId);
  const ups = await q.all('SELECT seq, upd FROM doc_updates WHERE doc_id=? ORDER BY seq', [a.docId]);
  const stateSeq = st[0][0] as number;
  const state = st[0][1] as Uint8Array;
  const seqs = ups.map((r) => r[0] as number);
  const updates = ups.map((r) => r[1] as Uint8Array);
  let contiguous = true;
  for (let i = 0; i < seqs.length; i++) if (seqs[i] !== stateSeq + 1 + i) contiguous = false;
  const res = {
    docId: a.docId,
    stateSeq,
    durableSeq: seqs.length ? seqs[seqs.length - 1] : stateSeq,
    contiguous,
    state,
    updates,
    queryMs: now() - t0,
  };
  return res;
}

// ---------------------------------------------------------------- write path

function push(m: Pending) {
  queue.push(m);
  if (timer === undefined) timer = setTimeout(() => void serial(flush), cfg.batchMs);
}

async function flush() {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  if (!queue.length) return { n: 0 };
  const batch = queue.splice(0);
  const t0 = now();
  try {
    await q.run('BEGIN IMMEDIATE');
    for (const u of batch) {
      await q.run('INSERT INTO doc_updates(doc_id, seq, ts, upd) VALUES(?,?,?,?)', [u.docId, u.seq, u.ts, u.update]);
    }
    await q.run('COMMIT');
  } catch (e: any) {
    try {
      await q.run('ROLLBACK');
    } catch {
      /* no transaction open */
    }
    queue.unshift(...batch);
    stats.flushErrors++;
    self.postMessage({ type: 'flush-error', error: String(e?.message ?? e), code: e?.code ?? e?.resultCode ?? null });
    if (timer === undefined) timer = setTimeout(() => void serial(flush), cfg.batchMs);
    return { n: 0, error: String(e?.message ?? e) };
  }
  const ms = now() - t0;
  const age = Date.now() - batch[0].ts;
  stats.batchMs.push(ms);
  stats.batchN.push(batch.length);
  stats.ageMs.push(age);
  const last = new Map<string, number>();
  const fresh = new Set<string>();
  for (const u of batch) {
    last.set(u.docId, u.seq);
    const p = pendingLog.get(u.docId);
    if (!p) {
      const r = await q.all('SELECT COUNT(*), COALESCE(SUM(LENGTH(upd)),0) FROM doc_updates WHERE doc_id=?', [u.docId]);
      pendingLog.set(u.docId, { count: r[0][0] as number, bytes: r[0][1] as number });
      fresh.add(u.docId);
    } else if (!fresh.has(u.docId)) {
      p.count++;
      p.bytes += u.update.byteLength;
    }
  }
  for (const [docId, seq] of last) self.postMessage({ type: 'durable', docId, seq, batchMs: ms, n: batch.length, ageMs: age });
  if (cfg.autoCompact) {
    for (const docId of last.keys()) {
      const p = pendingLog.get(docId)!;
      if (p.count >= cfg.compactCount || p.bytes >= cfg.compactBytes) {
        const c = await compact({ docId });
        stats.compactMs.push(c.totalMs);
        self.postMessage({ type: 'compacted', docId, ...c });
      }
    }
  }
  return { n: batch.length, ms };
}

/** Fold the update log of one document into its state and refresh its search text. */
async function compact(a: { docId: string; method?: 'doc' | 'merge' }) {
  const t0 = now();
  return tx(async () => {
    const st = await q.all('SELECT seq, state FROM doc_state WHERE doc_id=?', [a.docId]);
    const ups = await q.all('SELECT seq, upd FROM doc_updates WHERE doc_id=? ORDER BY seq', [a.docId]);
    const state = st[0][1] as Uint8Array;
    const updates = ups.map((r) => r[1] as Uint8Array);
    const lastSeq = ups.length ? (ups[ups.length - 1][0] as number) : (st[0][0] as number);
    const bytesBefore = state.byteLength + updates.reduce((s, u) => s + u.byteLength, 0);
    const tLoad = now();
    // Canonical compaction: load into a Y.Doc and re-encode (also yields the text).
    const doc = docFromState(state, updates);
    const next = Y.encodeStateAsUpdate(doc);
    const text = docText(doc);
    doc.destroy();
    const tDoc = now();
    // For comparison only: merge without instantiating a document.
    const merged = Y.mergeUpdates([state, ...updates]);
    const tMerge = now();
    await q.run('UPDATE doc_state SET state=?, seq=? WHERE doc_id=?', [next, lastSeq, a.docId]);
    await q.run('DELETE FROM doc_updates WHERE doc_id=? AND seq<=?', [a.docId, lastSeq]);
    const tWrite = now();
    await reindexText(a.docId, lastSeq, text);
    await q.run('UPDATE nodes SET words=? WHERE id=?', [countWords(text), a.docId]);
    const tIndex = now();
    pendingLog.set(a.docId, { count: 0, bytes: 0 });
    return {
      updates: updates.length,
      bytesBefore,
      bytesAfter: next.byteLength,
      mergeUpdatesBytes: merged.byteLength,
      readMs: tLoad - t0,
      yjsDocMs: tDoc - tLoad,
      yjsMergeUpdatesMs: tMerge - tDoc,
      writeMs: tWrite - tMerge,
      reindexMs: tIndex - tWrite,
      totalMs: 0,
    };
  }).then((r) => {
    r.totalMs = now() - t0 - r.yjsMergeUpdatesMs;
    return r;
  });
}

// ---------------------------------------------------------------- snapshots

async function mergedState(docId: string): Promise<{ state: Uint8Array; seq: number }> {
  const st = await q.all('SELECT seq, state FROM doc_state WHERE doc_id=?', [docId]);
  const ups = await q.all('SELECT seq, upd FROM doc_updates WHERE doc_id=? ORDER BY seq', [docId]);
  if (!ups.length) return { state: st[0][1] as Uint8Array, seq: st[0][0] as number };
  return {
    state: Y.mergeUpdates([st[0][1] as Uint8Array, ...ups.map((r) => r[1] as Uint8Array)]),
    seq: ups[ups.length - 1][0] as number,
  };
}

async function snapshot(a: { docId: string; label?: string }) {
  const t0 = now();
  const m = await mergedState(a.docId);
  await q.run('INSERT INTO snapshots(doc_id, created_at, label, seq, state) VALUES(?,?,?,?,?)', [
    a.docId,
    Date.now(),
    a.label ?? 'manual',
    m.seq,
    m.state,
  ]);
  const id = (await one('SELECT last_insert_rowid()')) as number;
  return { id, bytes: m.state.byteLength, ms: now() - t0 };
}

async function snapshotAll(a: { label?: string }) {
  const t0 = now();
  const res = await tx(async () => {
    const ts = Date.now();
    await q.run(
      `INSERT INTO snapshots(doc_id, created_at, label, seq, state)
       SELECT doc_id, ?, ?, seq, state FROM doc_state
       WHERE doc_id NOT IN (SELECT DISTINCT doc_id FROM doc_updates)`,
      [ts, a.label ?? 'all'],
    );
    const dirty = await q.all('SELECT DISTINCT doc_id FROM doc_updates');
    for (const r of dirty) {
      const m = await mergedState(r[0] as string);
      await q.run('INSERT INTO snapshots(doc_id, created_at, label, seq, state) VALUES(?,?,?,?,?)', [
        r[0] as string,
        ts,
        a.label ?? 'all',
        m.seq,
        m.state,
      ]);
    }
    return { docsWithPendingUpdates: dirty.length };
  });
  const count = (await one('SELECT COUNT(*) FROM doc_state')) as number;
  return { docs: count, ...res, ms: now() - t0 };
}

/**
 * Restore a snapshot.
 *  replace: overwrite the stored state (local only; a later sync would see history rewritten).
 *  forward: apply the snapshot's content to the current document as one new update
 *           (what a synced document needs; grows the document by the replaced text).
 */
async function restore(a: { snapshotId: number; mode: 'replace' | 'forward' }) {
  const t0 = now();
  return tx(async () => {
    const snap = await q.all('SELECT doc_id, state FROM snapshots WHERE id=?', [a.snapshotId]);
    if (!snap.length) throw new Error('no such snapshot');
    const docId = snap[0][0] as string;
    const snapState = snap[0][1] as Uint8Array;
    const snapDoc = docFromState(snapState, []);
    const text = docText(snapDoc);
    const cur = await q.all('SELECT seq FROM doc_state WHERE doc_id=?', [docId]);
    const maxUp = (await one('SELECT MAX(seq) FROM doc_updates WHERE doc_id=?', [docId])) as number | null;
    const seq = Math.max(cur[0][0] as number, maxUp ?? 0);
    let updateBytes = 0;
    if (a.mode === 'replace') {
      await q.run('UPDATE doc_state SET state=?, seq=? WHERE doc_id=?', [snapState, seq, docId]);
      await q.run('DELETE FROM doc_updates WHERE doc_id=?', [docId]);
      pendingLog.set(docId, { count: 0, bytes: 0 });
    } else {
      const m = await mergedState(docId);
      const doc = docFromState(m.state, []);
      let update: Uint8Array | undefined;
      doc.on('update', (u: Uint8Array) => (update = u));
      const paragraphs = docParagraphs(snapDoc);
      doc.transact(() => {
        const frag = doc.getXmlFragment(FRAG);
        frag.delete(0, frag.length);
        frag.insert(
          0,
          paragraphs.map((p) => {
            const el = new Y.XmlElement('paragraph');
            const t = new Y.XmlText();
            t.insert(0, p);
            el.insert(0, [t]);
            return el;
          }),
        );
      });
      doc.destroy();
      if (!update) throw new Error('restore produced no update');
      updateBytes = (update as Uint8Array).byteLength;
      await q.run('INSERT INTO doc_updates(doc_id, seq, ts, upd) VALUES(?,?,?,?)', [docId, seq + 1, Date.now(), update]);
      pendingLog.delete(docId);
    }
    snapDoc.destroy();
    const tState = now();
    await reindexText(docId, seq, text);
    return { docId, mode: a.mode, updateBytes, stateMs: tState - t0, reindexMs: now() - tState, ms: 0 };
  }).then((r) => {
    r.ms = now() - t0;
    return r;
  });
}

// ---------------------------------------------------------------- search

function ftsQuote(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

function summarise(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, first: xs[0], median: at(0.5), p95: at(0.95), max: s[s.length - 1] };
}

async function search(a: { kind: 'word' | 'phrase' | 'substring' | 'like' | 'regex'; q: string; flags?: string; runs?: number }) {
  const runs = a.runs ?? 15;
  const all: number[] = [];
  const top: number[] = [];
  let hits = 0;
  let matches = 0;
  let sample = '';
  for (let i = 0; i < runs; i++) {
    if (a.kind === 'regex') {
      const t0 = now();
      const rows = await q.all('SELECT doc_id, body FROM doc_text');
      const re = new RegExp(a.q, a.flags ?? 'g');
      hits = 0;
      matches = 0;
      for (const r of rows) {
        const m = (r[1] as string).match(re);
        if (m) {
          hits++;
          matches += m.length;
          if (!sample) sample = m[0];
        }
      }
      all.push(now() - t0);
    } else if (a.kind === 'like') {
      const t0 = now();
      const rows = await q.all('SELECT doc_id FROM doc_text WHERE body LIKE ?', ['%' + a.q + '%']);
      hits = rows.length;
      all.push(now() - t0);
    } else {
      const table = a.kind === 'substring' ? 'search_tri' : 'search';
      const m = ftsQuote(a.q);
      const t0 = now();
      const rows = await q.all(`SELECT rowid FROM ${table} WHERE ${table} MATCH ?`, [m]);
      hits = rows.length;
      all.push(now() - t0);
      const t1 = now();
      const first = await q.all(
        `SELECT d.doc_id, snippet(${table}, 0, '[', ']', '…', 10) FROM ${table} JOIN doc_text d ON d.id = ${table}.rowid
         WHERE ${table} MATCH ? ORDER BY rank LIMIT 20`,
        [m],
      );
      top.push(now() - t1);
      if (first.length) sample = String(first[0][1]).slice(0, 80);
    }
  }
  return { kind: a.kind, q: a.q, hits, matches, sample, allHits: summarise(all), top20WithSnippet: top.length ? summarise(top) : null };
}

async function integrity() {
  const t0 = now();
  const rows = await q.all('PRAGMA integrity_check');
  const msg = rows.map((r) => String(r[0])).join('; ');
  const t1 = now();
  let fts = 'ok';
  try {
    await db.exec("INSERT INTO search(search, rank) VALUES('integrity-check', 1); INSERT INTO search_tri(search_tri, rank) VALUES('integrity-check', 1);");
  } catch (e) {
    fts = String(e);
  }
  return { ok: msg === 'ok' && fts === 'ok', integrityCheck: msg, fts, integrityMs: t1 - t0, ftsCheckMs: now() - t1 };
}

function takeStats() {
  const out = {
    batchMs: summarise(stats.batchMs),
    batchN: summarise(stats.batchN),
    ageMs: summarise(stats.ageMs),
    compactMs: stats.compactMs.length ? summarise(stats.compactMs) : null,
    rawBatchMs: stats.batchMs.slice(),
    flushErrors: stats.flushErrors,
  };
  stats.batchMs = [];
  stats.batchN = [];
  stats.ageMs = [];
  stats.compactMs = [];
  stats.flushErrors = 0;
  return out;
}

// ---------------------------------------------------------------- dispatch

const ops: Record<string, (a: any) => Promise<any>> = {
  init,
  import: importProject,
  sizes,
  ftsVariants,
  tree,
  loadDoc,
  flush,
  compact,
  snapshot,
  snapshotAll,
  restore,
  search,
  integrity,
  stats: async () => takeStats(),
  // Fixed pure-JS workload: how fast is the CPU right now? Used to flag runs disturbed by other load.
  calibrate: async () => {
    const t0 = now();
    let x = 0x9e3779b9;
    for (let i = 0; i < 4_000_000; i++) x = (Math.imul(x ^ (x >>> 15), 0x85ebca6b) + i) | 0;
    return { ms: now() - t0, x };
  },
  config: async (a) => Object.assign(cfg, a),
  fixtureScene: async (a: { index: number }) => {
    const p = getProject();
    for (const ch of p.chapters) for (const s of ch.scenes) if (s.index === a.index) return { id: s.id, words: s.words, paragraphs: s.paragraphs };
    throw new Error('no such scene');
  },
  sql: async (a: { sql: string; params?: Param[] }) => q.all(a.sql, a.params),
  exec: async (a: { sql: string }) => db.exec(a.sql),
  close: async () => {
    await flush();
    await db.close();
    return true;
  },
};

self.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  if (m.type === 'push') {
    push(m as Pending);
    return;
  }
  const run = m.op === 'init' ? () => ops.init(m.args) : () => serial(() => ops[m.op](m.args ?? {}));
  run().then(
    (result) => {
      const transfer = result && result.__transfer ? (result.__transfer as Transferable[]) : [];
      if (result && result.__transfer) delete result.__transfer;
      self.postMessage({ type: 'reply', id: m.id, result }, transfer);
    },
    (err) => self.postMessage({ type: 'reply', id: m.id, error: String(err?.message ?? err), code: err?.code ?? err?.resultCode ?? null, name: err?.name ?? null }),
  );
};

self.postMessage({ type: 'boot', bootMs: bootAt });
