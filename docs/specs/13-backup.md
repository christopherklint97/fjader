# Package 13: Backup and restore

## Goal

A whole project can leave the device as one file that restores completely, and the writer is reminded to make one. This is the protection against a lost, reset or evicted device (`architecture.md` section 12).

## User-visible behaviour

- **Export.** "Export backup" in the project menu saves one file named `<project title> <date>.fjader`. On devices that offer a share sheet for files, the share sheet opens; elsewhere the file is downloaded.
- **Restore** is on the library screen and is built by package 04; this package's tests prove the round trip.
- **Reminder.** When a project has changes that are not in any backup and the last backup is more than seven days old (or there has never been one and the project has more than 1,000 words), a dismissible notice in the project says "Last backup: 9 days ago" with the button "Export backup". Dismissing hides it until the next day.
- **Storage settings**, a dialog reached from the library and the project menu: whether the browser has granted persistent storage, with a button to ask again; each project's size on the device; the date of the last backup; "Check database", which reports "No problems found" or the problem; the app's version (build id).
- When the first project is created, the app asks the browser for persistent storage. No prompt is shown by the app itself; some browsers show their own.

## Contracts provided

**Storage handlers**, replacing the stubs in `handlers/backup.ts`:

- `exportBackup()`: flushes, compacts every scene with a log, runs `PRAGMA wal_checkpoint(TRUNCATE)`, and returns the database file's bytes from `Db.exportFile()`. Before returning it sets `last_backup_at` to now and clears `changed_since_backup`, so the exported file itself records its own backup time.
- `stats()` and `check()` (`PRAGMA quick_check`).

**`src/features/backup/`**

- `BackupMenuItems.tsx` and `StorageSettingsEntry.tsx` replace the stubs.
- `reminder.ts`: `backupDue(meta: ProjectMeta, totalWords: number, now: number): boolean`, pure.
- `StorageSettings.tsx`.

## Contracts consumed

- Package 03: `Db.exportFile`, `open` with `importFrom`, `listProjects`, the handler table.
- Package 04: `useProject`, `ProjectStore.meta`, the library screen's restore and its entry place for storage settings.
- Package 00: `Dialog`, `BUILD_ID`, `saveFile`.

## Data model changes

None in the schema; uses `last_backup_at` and `changed_since_backup` in `meta`. The backup file format is the project's SQLite database at its current schema version, with the extension `.fjader` and the media type `application/vnd.sqlite3`.

## Acceptance criteria

1. Round trip, both engines, on the fixture with three snapshots and two bookmarks added: export, delete the project, restore. Every scene's plain text and marks, the tree, the snapshots and the bookmarks are identical to the original; the restored project has a different id.
2. The exported file opens with a stock SQLite library (Bun's, in the test): `PRAGMA integrity_check` returns `ok`, `user_version` is the current version, and no separate write-ahead log file is needed to read every table.
3. Text typed within the last 250 ms before choosing "Export backup" is in the file.
4. A backup exported from a project that was open and being typed in restores without error (the file is complete without its write-ahead log).
5. A restored backup shows today as its last backup date and no reminder.
6. Restoring a backup with an older schema version migrates it and opens it. (Tested with a registered test migration.)
7. Unit: `backupDue` is false for a project with no changes since its backup, true eight days after a backup with changes, true for a never-backed-up project of 1,500 words, false for one of 500 words.
8. After an export, the reminder is gone and "Last backup" shows today.
9. Storage settings show a size within 5 percent of the database file's real size, and never the value of `navigator.storage.estimate()`.
10. "Check database" on a healthy project reports no problems.
11. No axe violations in the storage settings dialog.

## Performance budgets

Spike B did not measure exporting the database file; these are new thresholds for this package to prove on the fixture.

| Measure | Threshold |
|---|---|
| Export the fixture, from choosing the item to the bytes handed to `saveFile` | at most 2 s in both engines |
| Restore the fixture, from choosing the file to the project listed | at most 3 s |
| Size of the fixture's backup file | at most 12 MB (Spike B: about 6 MB without search indexes) |
| Main thread blocked during export or restore | no frame longer than 100 ms |

## Accessibility and mobile

- The reminder is a polite live region and does not take focus.
- **Not verified on a device:** saving a file from an installed iPhone web app. `saveFile` prefers the share sheet there; the real check is in `README.md`. If neither route works on a device, the fallback is opening the file in a new tab; that change stays inside `src/platform/save-file.ts`.

## Out of scope

Automatic backups to a folder (possible only in Chromium), cloud destinations, encrypted backups, exporting a project as loose text files, merging a backup into an existing project.

## Dependencies

Packages 03 and 04.
