// wa-sqlite (PowerSync fork build, which has FTS5 compiled in) with OPFSCoopSyncVFS.
// @ts-ignore no types for the deep imports
import SQLiteESMFactory from '@journeyapps/wa-sqlite/dist/wa-sqlite.mjs';
// @ts-ignore
import * as SQLite from '@journeyapps/wa-sqlite';
// @ts-ignore
import { OPFSCoopSyncVFS } from '@journeyapps/wa-sqlite/src/examples/OPFSCoopSyncVFS.js';
import type { Db, OpenInfo, Param, Row, Stmt } from './db';

export async function openWa(name: string): Promise<{ db: Db; info: OpenInfo }> {
  const t0 = performance.now();
  const module = await (SQLiteESMFactory as any)();
  const sqlite3: any = (SQLite as any).Factory(module);
  const t1 = performance.now();
  const vfs = await (OPFSCoopSyncVFS as any).create(`${name}-coop`, module);
  sqlite3.vfs_register(vfs, true);
  const t2 = performance.now();
  const handle: number = await sqlite3.open_v2(`${name}-coop.db`);
  const t3 = performance.now();
  const ROW = (SQLite as any).SQLITE_ROW;

  const stmts: number[] = [];
  const copyRow = (r: any[]): Row => r.map((v) => (v instanceof Uint8Array ? v.slice() : v));

  const db: Db = {
    vfs: 'coop',
    library: '@journeyapps/wa-sqlite 2.0.10, SQLite ' + sqlite3.libversion(),
    async exec(sql: string) {
      await sqlite3.exec(handle, sql);
    },
    async prepare(sql: string): Promise<Stmt> {
      let st = 0;
      for await (const s of sqlite3.statements(handle, sql, { unscoped: true })) {
        st = s;
        break;
      }
      if (!st) throw new Error('prepare produced no statement: ' + sql);
      stmts.push(st);
      return {
        async run(params?: Param[]) {
          if (params && params.length) sqlite3.bind_collection(st, params);
          try {
            while ((await sqlite3.step(st)) === ROW) {
              /* drain */
            }
          } finally {
            await sqlite3.reset(st);
          }
        },
        async all(params?: Param[]): Promise<Row[]> {
          if (params && params.length) sqlite3.bind_collection(st, params);
          const rows: Row[] = [];
          try {
            while ((await sqlite3.step(st)) === ROW) rows.push(copyRow(sqlite3.row(st)));
          } finally {
            await sqlite3.reset(st);
          }
          return rows;
        },
      };
    },
    async close() {
      for (const st of stmts) await sqlite3.finalize(st);
      await sqlite3.close(handle);
    },
  };
  return { db, info: { wasmInitMs: t1 - t0, vfsInstallMs: t2 - t1, dbOpenMs: t3 - t2 } };
}
