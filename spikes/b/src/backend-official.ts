// Official SQLite WASM build: opfs-sahpool, opfs, opfs-wl.
// @ts-ignore types are loose for the parts used here
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Db, OpenInfo, Param, Row, Stmt, VfsName } from './db';

export async function openOfficial(vfs: VfsName, name: string): Promise<{ db: Db; info: OpenInfo }> {
  const t0 = performance.now();
  const quiet = () => {};
  const sqlite3: any = await (sqlite3InitModule as any)({ print: quiet, printErr: quiet });
  const t1 = performance.now();
  let oo: any;
  let t2: number;
  if (vfs === 'sahpool') {
    const pool = await sqlite3.installOpfsSAHPoolVfs({
      name: 'opfs-sahpool',
      directory: `.${name}-sahpool`,
      initialCapacity: 6,
      clearOnInit: false,
    });
    t2 = performance.now();
    oo = new pool.OpfsSAHPoolDb(`/${name}.db`);
  } else if (vfs === 'opfs') {
    if (!sqlite3.oo1.OpfsDb) throw new Error('official "opfs" VFS did not install (needs SharedArrayBuffer, i.e. COOP/COEP headers)');
    t2 = performance.now();
    oo = new sqlite3.oo1.OpfsDb(`/${name}-opfs.db`, 'c');
  } else if (vfs === 'opfs-wl') {
    if (!sqlite3.oo1.OpfsWlDb) throw new Error('official "opfs-wl" VFS did not install (needs SharedArrayBuffer and Atomics.waitAsync)');
    t2 = performance.now();
    oo = new sqlite3.oo1.OpfsWlDb(`/${name}-opfswl.db`, 'c');
  } else {
    throw new Error('not an official VFS: ' + vfs);
  }
  if (vfs !== 'sahpool') oo.exec('PRAGMA busy_timeout=5000');
  const t3 = performance.now();

  const db: Db = {
    vfs,
    library: '@sqlite.org/sqlite-wasm ' + sqlite3.version.libVersion,
    async exec(sql: string) {
      oo.exec(sql);
    },
    async prepare(sql: string): Promise<Stmt> {
      const st = oo.prepare(sql);
      return {
        async run(params?: Param[]) {
          if (params && params.length) st.bind(params);
          try {
            while (st.step()) {
              /* drain */
            }
          } finally {
            st.reset();
          }
        },
        async all(params?: Param[]): Promise<Row[]> {
          if (params && params.length) st.bind(params);
          const rows: Row[] = [];
          try {
            while (st.step()) rows.push(st.get([]));
          } finally {
            st.reset();
          }
          return rows;
        },
      };
    },
    async close() {
      oo.close();
    },
  };
  return { db, info: { wasmInitMs: t1 - t0, vfsInstallMs: t2 - t1, dbOpenMs: t3 - t2 } };
}
