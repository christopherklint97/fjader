// The one small interface both storage layers sit behind.
export type Param = string | number | null | Uint8Array;
export type Row = (string | number | null | Uint8Array)[];

export interface Stmt {
  run(params?: Param[]): Promise<void>;
  all(params?: Param[]): Promise<Row[]>;
}

export interface Db {
  readonly vfs: VfsName;
  readonly library: string;
  exec(sql: string): Promise<void>;
  prepare(sql: string): Promise<Stmt>;
  close(): Promise<void>;
}

export type VfsName = 'sahpool' | 'coop' | 'opfs' | 'opfs-wl';

export const VFS_LABEL: Record<VfsName, string> = {
  sahpool: 'official opfs-sahpool',
  coop: 'wa-sqlite OPFSCoopSyncVFS',
  opfs: 'official opfs',
  'opfs-wl': 'official opfs-wl',
};

export interface OpenInfo {
  wasmInitMs: number;
  vfsInstallMs: number;
  dbOpenMs: number;
}

export type PragmaProfile = 'default' | 'tuned' | 'sync-normal' | 'truncate' | 'wal' | 'wal-full' | 'wal-limit';

const WAL = ['PRAGMA locking_mode=exclusive', 'PRAGMA journal_mode=wal'];
// Without these the WAL file keeps its high-water size for ever (a 15 MB import
// left 26 MB of WAL behind). Checkpoint every 128 pages and cut the file back to 1 MB.
const WAL_LIMIT = [...WAL, 'PRAGMA synchronous=normal', 'PRAGMA wal_autocheckpoint=128', 'PRAGMA journal_size_limit=1048576'];

/**
 * Pragmas applied right after open. "default" is what the library gives
 * (rollback journal deleted per commit, synchronous=full).
 * "tuned" is the profile this spike recommends per layer:
 *  - opfs-sahpool: one connection only, so exclusive locking costs nothing and
 *    allows WAL; WAL with synchronous=normal cannot corrupt, it can only lose
 *    the last commits on power loss. The WAL file is kept small (see WAL_LIMIT).
 *  - OPFSCoopSyncVFS: accepts only journal_mode off, memory, delete or wal, and
 *    wal needs exclusive locking, which removes its multi-connection support.
 *    So the safe setting is the default.
 *  - official opfs / opfs-wl: rollback journal, truncated instead of deleted.
 */
export function pragmasFor(vfs: VfsName, profile: PragmaProfile): string[] {
  switch (profile) {
    case 'default':
      return [];
    case 'sync-normal':
      return ['PRAGMA synchronous=normal'];
    case 'truncate':
      return ['PRAGMA journal_mode=truncate'];
    case 'wal':
      return [...WAL, 'PRAGMA synchronous=normal'];
    case 'wal-full':
      return [...WAL, 'PRAGMA synchronous=full'];
    case 'wal-limit':
      return WAL_LIMIT;
    case 'tuned':
      if (vfs === 'sahpool') return WAL_LIMIT;
      if (vfs === 'coop') return [];
      return ['PRAGMA journal_mode=truncate'];
  }
}

export class Cache {
  private map = new Map<string, Stmt>();
  constructor(private db: Db) {}
  async get(sql: string): Promise<Stmt> {
    let s = this.map.get(sql);
    if (!s) {
      s = await this.db.prepare(sql);
      this.map.set(sql, s);
    }
    return s;
  }
  async run(sql: string, params?: Param[]): Promise<void> {
    return (await this.get(sql)).run(params);
  }
  async all(sql: string, params?: Param[]): Promise<Row[]> {
    return (await this.get(sql)).all(params);
  }
}
