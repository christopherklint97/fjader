// Turn the JSON in test/out into the markdown tables used in docs/spikes/results/B.md.
// Usage: node test/report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const read = (name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(out, name), 'utf8'));
  } catch {
    return null;
  }
};
const f1 = (x) => (x === undefined || x === null ? '–' : x >= 100 ? String(Math.round(x)) : (Math.round(x * 10) / 10).toString());
const mb = (x) => (x === undefined || x === null ? '–' : (x / 1e6).toFixed(2));
const kb = (x) => (x === undefined || x === null ? '–' : (x / 1e3).toFixed(1));
const safe = (fn) => (c) => { try { const v = fn(c); return v === undefined || v === null ? '–' : v; } catch { return '–'; } };
const table = (head, rows) => {
  console.log('| ' + head.join(' | ') + ' |');
  console.log('|' + head.map(() => '---').join('|') + '|');
  for (const r of rows) console.log('| ' + r.join(' | ') + ' |');
  console.log('');
};
const LABEL = { sahpool: '`opfs-sahpool`', coop: '`OPFSCoopSyncVFS`', opfs: 'official `opfs`', 'opfs-wl': 'official `opfs-wl`' };

const sets = [
  ['Chromium', 'plain', 'measure-chromium-plain.json', 'cold-chromium-plain.json'],
  ['Chromium', 'isolated', 'measure-chromium-coi-opfs.json', null],
  ['Chromium', 'isolated', 'measure-chromium-coi-headerfree.json', null],
  ['WebKit', 'plain', 'measure-webkit-plain.json', 'cold-webkit-plain.json'],
  ['WebKit', 'isolated', 'measure-webkit-coi-headerfree.json', null],
];

const cols = [];
for (const [browser, mode, file, coldFile] of sets) {
  const d = read(file);
  if (!d) continue;
  const cold = coldFile ? read(coldFile) : null;
  for (const [vfs, o] of Object.entries(d.vfs)) cols.push({ browser, mode, vfs, o, typingSeconds: d.typingSeconds, cold: cold?.vfs?.[vfs]?.summary ?? null });
}
const name = (c) => `${c.browser} ${c.mode}, ${LABEL[c.vfs]}`;
const err = (x) => x && x.error;

console.log('## Thresholds\n');
const rows = [];
const add = (label, fn) => rows.push([label, ...cols.map((c) => { try { return fn(c) ?? '–'; } catch { return '–'; } })]);
const coldOf = (c, k) => {
  if (c.cold) return `${f1(c.cold[k].median)} (${f1(c.cold[k].min)}–${f1(c.cold[k].max)})`;
  const map = { workerStartToTreeMs: 'treeLoadedMs', navToTreeMs: 'pageClockAtTreeMs', firstDocMs: 'firstDocMs', treeQueryMs: 'treeQueryMs' };
  const xs = c.o.cold.filter((r) => r.open).map((r) => r.open[map[k]]).sort((a, b) => a - b);
  return xs.length ? `${f1(xs[Math.floor(xs.length / 2)])} (${f1(xs[0])}–${f1(xs[xs.length - 1])})` : '–';
};
add('Tree loaded, from starting the worker (≤ 300 ms)', (c) => coldOf(c, 'workerStartToTreeMs'));
add('Tree loaded, from navigation start', (c) => coldOf(c, 'navToTreeMs'));
add('First document after the tree (≤ 50 ms)', (c) => coldOf(c, 'firstDocMs'));
add('Document load, warm, median / p95 (≤ 50 ms)', (c) => { const d = c.o.cold.at(-1).docLoad; return `${f1(d.typicalDocMs.median)} / ${f1(d.typicalDocMs.p95)}`; });
add('Document load, 10,000-word scene, median', (c) => f1(c.o.cold.at(-1).docLoad.bigDocMs.median));
add('Write batch in the worker, p95 / max (≤ 20 ms)', (c) => (err(c.o.typing) ? 'error' : `${f1(c.o.typing.workerBatchMs.p95)} / ${f1(c.o.typing.workerBatchMs.max)} (n=${c.o.typing.workerBatchMs.n})`));
add('Change sent to change durable, p95 / max (≤ 500 ms)', (c) => `${f1(c.o.typing.mainAckLagMs.p95)} / ${f1(c.o.typing.mainAckLagMs.max)}`);
add('Main thread: per change p95; timer drift p95 / max', (c) => `${f1(c.o.typing.mainPerChangeMs.p95)}; ${f1(c.o.typing.mainTimerDriftMs.p95)} / ${f1(c.o.typing.mainTimerDriftMs.max)}`);
add('Word search, common word, first 20 with snippets, p95 (≤ 150 ms)', (c) => f1(c.o.search.wordCommon.top20WithSnippet.p95));
add('Word search, rare word, p95', (c) => f1(c.o.search.wordRare.top20WithSnippet.p95));
add('Phrase search, p95 (≤ 150 ms)', (c) => f1(c.o.search.phrase.top20WithSnippet.p95));
add('Substring, trigram index, p95', (c) => f1(c.o.search.substringTrigram.top20WithSnippet.p95));
add('Substring, LIKE scan without index, median / p95', (c) => `${f1(c.o.search.substringLikeScan.allHits.median)} / ${f1(c.o.search.substringLikeScan.allHits.p95)}`);
add('Regular-expression scan, median / p95 (≤ 1,500 ms)', (c) => `${f1(c.o.search.regexScan.allHits.median)} / ${f1(c.o.search.regexScan.allHits.p95)}`);
add('Search hit counts as planted', (c) => (c.o.search.hitsCorrect ? 'yes' : 'NO'));
add('Stored size after import, on disk, MB (≤ 30)', (c) => mb(c.o.diskAfterImport.bytes));
add('Stored size after VACUUM, on disk, MB', (c) => mb(c.o.diskAfterVacuum.bytes));
add('Snapshot one document, median / max (≤ 50 ms)', (c) => `${f1(c.o.snapshots.typicalScene.snapshotMs.median)} / ${f1(c.o.snapshots.typicalScene.snapshotMs.max)}`);
add('Snapshot the 10,000-word scene, median / max', (c) => `${f1(c.o.snapshots.bigScene.snapshotMs.median)} / ${f1(c.o.snapshots.bigScene.snapshotMs.max)}`);
add('Restore (replace) and reload, median / max (≤ 100 ms)', (c) => `${f1(c.o.snapshots.typicalScene.restoreReplaceAndReloadMs.median)} / ${f1(c.o.snapshots.typicalScene.restoreReplaceAndReloadMs.max)}`);
add('Restore (replace), 10,000-word scene, median / max', (c) => `${f1(c.o.snapshots.bigScene.restoreReplaceAndReloadMs.median)} / ${f1(c.o.snapshots.bigScene.restoreReplaceAndReloadMs.max)}`);
add('Restore (forward update) and reload, median / max', (c) => `${f1(c.o.snapshots.typicalScene.restoreForwardAndReloadMs.median)} / ${f1(c.o.snapshots.typicalScene.restoreForwardAndReloadMs.max)}`);
add('Restore (forward), 10,000-word scene, median / max', (c) => `${f1(c.o.snapshots.bigScene.restoreForwardAndReloadMs.median)} / ${f1(c.o.snapshots.bigScene.restoreForwardAndReloadMs.max)}`);
add('Restored text correct', (c) => (c.o.snapshots.typicalScene.restoredTextCorrect && c.o.snapshots.bigScene.restoredTextCorrect ? 'yes' : 'NO'));
add('Snapshot all 600 documents, ms', (c) => f1(c.o.snapshots.snapshotAll.ms));
add('Import, ms (Yjs encode + SQL + commit)', (c) => f1(c.o.import.timings.importWithoutGenerateMs));
add('Index optimise after import, ms', (c) => f1(c.o.import.timings.ftsOptimizeMs));
add('Typing run verified by replay; integrity check at end', (c) => `${c.o.verifyTypingScene.ok ? 'ok' : 'FAIL'}; ${c.o.integrityEnd.ok ? 'ok' : 'FAIL'}`);
add('Typing run length, s', (c) => String(c.typingSeconds));
add('CPU calibration during typing, median / max, ms (host load at start)', (c) => (c.o.typing.cpuCalibrationMs ? `${f1(c.o.typing.cpuCalibrationMs.median)} / ${f1(c.o.typing.cpuCalibrationMs.max)} (${c.o.load?.typing ?? '?'})` : 'not recorded'));
table(['Measure (ms unless noted)', ...cols.map(name)], rows);

console.log('## Size split after import (MB)\n');
table(
  ['Part', ...cols.map(name)],
  [
    ['SQLite version, page size', ...cols.map(safe((c) => `${c.o.info.sqliteVersion}, ${c.o.info.pageSize}`))],
    ['Journal, synchronous', ...cols.map(safe((c) => `${c.o.info.journalMode}, ${c.o.info.synchronous}`))],
    ['Document states (Yjs), payload', ...cols.map(safe((c) => mb(c.o.import.sizes.payload.docStateBytes)))],
    ['Update log, payload', ...cols.map(safe((c) => mb(c.o.import.sizes.payload.updateLogBytes)))],
    ['Plain text for search, payload', ...cols.map(safe((c) => mb(c.o.import.sizes.payload.plainTextBytes)))],
    ['Word index, payload', ...cols.map(safe((c) => mb(c.o.import.sizes.payload.wordIndexBytes)))],
    ['Trigram index, payload', ...cols.map(safe((c) => mb(c.o.import.sizes.payload.trigramIndexBytes)))],
    ['Document states, pages (dbstat)', ...cols.map(safe((c) => mb(c.o.vacuumAfterImport.onDisk?.docState)))],
    ['Plain text, pages', ...cols.map(safe((c) => mb(c.o.vacuumAfterImport.onDisk?.plainText)))],
    ['Word index, pages', ...cols.map(safe((c) => mb(c.o.vacuumAfterImport.onDisk?.wordIndex)))],
    ['Trigram index, pages', ...cols.map(safe((c) => mb(c.o.vacuumAfterImport.onDisk?.trigramIndex)))],
    ['Tree, pages', ...cols.map(safe((c) => mb(c.o.vacuumAfterImport.onDisk?.tree)))],
    ['Database file after import (free pages inside)', ...cols.map(safe((c) => `${mb(c.o.import.sizes.fileBytes)} (${mb(c.o.import.sizes.freeBytes)})`))],
    ['Database file after VACUUM', ...cols.map(safe((c) => mb(c.o.vacuumAfterImport.fileBytes)))],
    ['OPFS bytes on disk after import / after VACUUM', ...cols.map(safe((c) => `${mb(c.o.diskAfterImport.bytes)} / ${mb(c.o.diskAfterVacuum.bytes)}`))],
    ['storage.estimate() usage after import / after VACUUM', ...cols.map(safe((c) => `${mb(c.o.import.sizes.estimate?.usage)} / ${mb(c.o.vacuumAfterImport.estimate?.usage)}`))],
    ['storage.estimate() quota, MB', ...cols.map(safe((c) => f1((c.o.import.sizes.estimate?.quota ?? 0) / 1e6)))],
  ],
);

console.log('## Typing run: growth and compaction\n');
table(
  ['Measure', ...cols.map(name)],
  [
    ['Changes written', ...cols.map(safe((c) => String(c.o.typing.changes)))],
    ['Batches; changes per batch (median)', ...cols.map(safe((c) => `${c.o.typing.workerBatchMs.n}; ${c.o.typing.workerBatchSize.median}`))],
    ['Batch latency median / p95 / max, ms', ...cols.map(safe((c) => `${f1(c.o.typing.workerBatchMs.median)} / ${f1(c.o.typing.workerBatchMs.p95)} / ${f1(c.o.typing.workerBatchMs.max)}`))],
    ['Yjs update size median / max, bytes', ...cols.map(safe((c) => `${c.o.typing.updateBytes.median} / ${c.o.typing.updateBytes.max}`))],
    ['Update log after the run: rows, KB payload', ...cols.map(safe((c) => `${c.o.typing.sizeAfterTyping.updateLogRows}, ${kb(c.o.typing.sizeAfterTyping.updateLogBytes)}`))],
    ['Database file before / after typing, MB', ...cols.map(safe((c) => `${mb(c.o.typing.sizeBefore.fileBytes)} / ${mb(c.o.typing.sizeAfterTyping.fileBytes)}`))],
    ['OPFS bytes on disk after typing, MB', ...cols.map(safe((c) => mb(c.o.diskAfterTyping.bytes)))],
    ['Scene state + log before compaction, KB', ...cols.map(safe((c) => kb(c.o.typing.compactAfterRun.bytesBefore)))],
    ['Scene state after compaction, KB', ...cols.map(safe((c) => kb(c.o.typing.compactAfterRun.bytesAfter)))],
    ['Compaction of that log, ms (Yjs / reindex)', ...cols.map(safe((c) => `${f1(c.o.typing.compactAfterRun.totalMs)} (${f1(c.o.typing.compactAfterRun.yjsDocMs)} / ${f1(c.o.typing.compactAfterRun.reindexMs)})`))],
    ['Database file after compaction, MB (free inside)', ...cols.map(safe((c) => `${mb(c.o.typing.sizeAfterCompaction.fileBytes)} (${mb(c.o.typing.sizeAfterCompaction.freeBytes)})`))],
  ],
);

console.log('## Compaction curve\n');
for (const c of cols) {
  if (!c.o.compaction || err(c.o.compaction) || !c.o.compaction.typicalScene) continue;
  console.log(`**${name(c)}**\n`);
  const r = [];
  for (const k of ['typicalScene', 'bigScene']) {
    for (const x of c.o.compaction[k]) {
      r.push([k === 'typicalScene' ? 'typical' : '10,000 words', x.pendingUpdates, f1(x.loadWithLogMs), f1(x.loadAfterCompactMs), kb(x.logAndStateBytes), kb(x.compactedBytes), kb(x.mergeUpdatesBytes), f1(x.compactTotalMs), f1(x.compactYjsMs), f1(x.compactReindexMs), f1(x.mergeUpdatesMs)]);
    }
  }
  table(['Scene', 'Updates in log', 'Load with log, ms', 'Load after, ms', 'State + log, KB', 'Compacted, KB', 'mergeUpdates result, KB', 'Compaction, ms', 'of which Yjs', 'of which reindex', 'mergeUpdates alone, ms'], r);
}

console.log('## Index variants\n');
for (const c of cols) {
  if (!c.o.ftsVariants || err(c.o.ftsVariants)) continue;
  console.log(`**${name(c)}**\n`);
  table(['Variant', 'Index size, MB', 'Build, ms', 'Substring query (LIKE through the index), ms'], Object.entries(c.o.ftsVariants).map(([k, v]) => [k, mb(v.bytes), f1(v.buildMs), f1(v.substringLikeMs)]));
}

console.log('## Cold open breakdown\n');
for (const [browser, file] of [['Chromium', 'cold-chromium-plain.json'], ['WebKit', 'cold-webkit-plain.json']]) {
  const d = read(file);
  if (!d) continue;
  const keys = ['navToTreeMs', 'navToFirstDocMs', 'workerStartToTreeMs', 'initMs', 'wasmInitMs', 'vfsInstallMs', 'dbOpenMs', 'pragmaMs', 'schemaMs', 'treeQueryMs', 'firstDocMs', 'warmTypicalDocMedianMs', 'warmTypicalDocP95Ms', 'warmBigDocMedianMs'];
  const v = Object.entries(d.vfs);
  table([`${browser}, median (min–max) of ${d.runs} cold starts`, ...v.map(([k]) => LABEL[k])], [...keys.map((k) => [k, ...v.map(([, x]) => `${f1(x.summary[k].median)} (${f1(x.summary[k].min)}–${f1(x.summary[k].max)})`)]), ['failures', ...v.map(([, x]) => String(x.summary.failures))]]);
}

console.log('## Pragmas and batch interval\n');
for (const [browser, file] of [['Chromium', 'pragmas-chromium-plain.json'], ['WebKit', 'pragmas-webkit-plain.json']]) {
  const d = read(file);
  if (!d) continue;
  console.log(`**${browser}**, ${d.seconds} s of typing per run, ${d.rounds} interleaved rounds\n`);
  const groups = new Map();
  for (const r of d.runs) {
    const k = `${r.vfs}|${r.profile}|${r.batchMs}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const mid = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const rows = [];
  for (const rs of groups.values()) {
    const ok = rs.filter((r) => !r.error);
    if (!ok.length) { rows.push([LABEL[rs[0].vfs], rs[0].profile, 'error: ' + rs[0].error.slice(0, 90), '', '', '', '', '', '']); continue; }
    rows.push([
      LABEL[ok[0].vfs],
      ok[0].profile,
      `${ok[0].journal}, ${ok[0].sync}`,
      ok[0].batchMs,
      ok.map((r) => f1(r.batch_.median)).join(', '),
      ok.map((r) => f1(r.batch_.p95)).join(', '),
      ok.map((r) => f1(r.batch_.max)).join(', '),
      f1(mid(ok.map((r) => r.ackLag.p95))),
      ok.map((r) => f1(r.cal)).join(', '),
    ]);
  }
  table(['Layer', 'Profile', 'Journal, sync', 'Batch interval, ms', 'Batch median per run, ms', 'Batch p95 per run, ms', 'Batch max per run, ms', 'Durable lag p95, ms', 'CPU calibration, ms'], rows);
}

console.log('## Kill tests\n');
for (const file of fs.readdirSync(out).filter((f) => f.startsWith('kill-')).sort()) {
  const d = read(file);
  const r = [];
  for (const [vfs, v] of Object.entries(d.vfs)) {
    const runs = v.runs;
    const group = (kind, setting) => runs.filter((x) => x.kind === kind && x.setting === setting);
    for (const setting of ['normal', 'stress']) {
      for (const kind of ['sigkill-all', 'sigkill-renderer', 'page-close', 'context-close']) {
        const g = group(kind, setting);
        if (!g.length) continue;
        const lost = g.map((x) => x.lostMs ?? 0).sort((a, b) => a - b);
        r.push([LABEL[vfs], setting, kind, g.length, g.filter((x) => !x.ok).length, g.filter((x) => x.ackedButLost > 0).length, `${lost[Math.floor(lost.length / 2)]} / ${lost[lost.length - 1]}`, Math.max(...g.map((x) => x.reopenMs ?? 0))]);
      }
    }
  }
  console.log(`**${d.browser} ${d.mode}**\n`);
  table(['Layer', 'Setting', 'Kill', 'Runs', 'Corrupt or unreadable', 'Acknowledged write missing', 'Typing lost, median / max, ms', 'Slowest reopen, ms'], r);
}

console.log('## Two tabs\n');
for (const file of fs.readdirSync(out).filter((f) => f.startsWith('tabs-')).sort()) {
  const d = read(file);
  console.log(`**${d.browser} ${d.mode}**\n`);
  const r = [];
  for (const [vfs, v] of Object.entries(d.vfs)) {
    const n = v.noLock ?? {};
    const w = v.webLock ?? {};
    r.push([
      LABEL[vfs],
      n.tab2?.ok ? `opens (${n.tab2.ms} ms)` : `fails: ${String(n.tab2?.error).slice(0, 110)}`,
      n.typingTab1 && !n.typingTab1.error ? `tab 1 p95 ${f1(n.typingTab1.batchMs.p95)} max ${f1(n.typingTab1.batchMs.max)}; tab 2 p95 ${f1(n.typingTab2.batchMs?.p95)} max ${f1(n.typingTab2.batchMs?.max)}; write errors ${n.typingTab1.flushErrors}+${n.typingTab2.flushErrors}; verified ${n.verifyTab1Scene?.ok}/${n.verifyTab2Scene?.ok}` : n.typingTab1?.error ?? 'n/a',
      n.readWhileOtherTabWrites ? `${n.readWhileOtherTabWrites.reads.n} reads, median ${f1(n.readWhileOtherTabWrites.reads.median)} max ${f1(n.readWhileOtherTabWrites.reads.max)} ms, errors ${n.readWhileOtherTabWrites.reads.errors}` : 'n/a',
      w.tab2WhileTab1Open ? (w.tab2WhileTab1Open.ready ? 'did NOT wait' : 'waits, shows notice') : 'n/a',
      w.tab2AfterTab1Closed?.ok ? `${w.takeoverMs} ms, then writes ${w.tab2CanWrite?.storedEqualsLive ? 'ok' : 'FAIL'}` : `fails: ${w.tab2AfterTab1Closed?.error}`,
    ]);
  }
  table(['Layer', 'Second tab, no lock', 'Both tabs typing (batch ms)', 'Reads while the other tab writes', 'Second tab with Web Lock', 'Takeover after first tab closes'], r);
}
