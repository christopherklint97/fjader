# Package 11: Snapshots

## Goal

The writer can keep earlier states of a scene, see what changed, and bring an earlier state back. The model is `architecture.md` section 4.6.

## User-visible behaviour

- **Panel.** "Snapshots" in the project menu, or the snapshot shortcut, opens a side panel for the scene holding the caret. It lists that scene's snapshots, newest first: name or kind ("Automatic", "Before restore", "Before merge"), date and time, word count.
- **Take a snapshot.** A button at the top of the panel takes one now. The writer may give it a name; an unnamed manual snapshot shows as "Snapshot". The shortcut takes an unnamed snapshot without opening the panel and confirms with a toast.
- **Automatic snapshots.** When the writer starts changing a scene whose last snapshot is more than 30 minutes old, the app first keeps the scene as it was. The writer does nothing for this.
- **Compare.** Choosing a snapshot shows its text against the current text of the scene in one column: removed words struck through, added words underlined, unchanged paragraphs collapsed to a line saying how many were skipped. The view is read-only.
- **Restore.** "Restore this version" asks for confirmation, then replaces the scene's text with the snapshot's. The state before the restore is kept as a "Before restore" snapshot, and the restore can also be undone with Undo.
- **Rename and delete** from each snapshot's menu. Deleting asks for confirmation.
- The panel follows the caret: moving to another scene shows that scene's snapshots.

## Contracts provided

**Storage handlers**, replacing the stubs in `handlers/snapshots.ts`:

- `createSnapshot(sceneId, kind, name?)`: compacts the scene, copies its state into `snapshot` with its word count, applies retention, returns the `SnapshotMeta`.
- `listSnapshots(sceneId)`: newest first, without states.
- `getSnapshot(id)`, `renameSnapshot(id, name)`, `deleteSnapshot(id)`.
- `beforeFirstUpdate(sceneId)`, called by the write path (package 03): implements the automatic rule. If the scene's stored state has words, and its newest snapshot is absent or older than 30 minutes, and the stored state differs from that snapshot's state, it stores an `auto` snapshot of the stored state in the same transaction as the incoming batch.
- **Retention:** after each insert, for that scene, snapshots of kinds other than `manual` beyond the newest 30 are deleted.

**`src/features/snapshots/`**

- `SnapshotsPanel.tsx` replaces the stub.
- `restore.ts`: `restoreSnapshot(project, id)`: takes a `pre-restore` snapshot, loads the snapshot's state, converts it with `model/convert.ts`, and replaces the scene's content through `SceneStore.apply(sceneId, 'edit', …)` in one step.
- `compare.ts`: `compareTexts(before: string, after: string): Change[]`, word-level, using the `diff` package on the two plain texts, paragraph by paragraph.

Registers the shortcut `snapshot.create`.

## Contracts consumed

- Package 03: handler table, compaction, the `beforeFirstUpdate` call.
- Package 04: `SceneStore.apply` and `acquire`, `Navigator.current`, `useProject`.
- Package 00: `openPanel` from `ui/panels.ts`, shortcuts, `Toast`.
- Package 01: `SnapshotMeta`, `SnapshotKind`, `model/convert.ts`, `model/text.ts`.

## Data model changes

None in the schema; uses the `snapshot` table of version 1.

## Acceptance criteria

1. Unit, over the `Db` interface: `createSnapshot` stores a state whose text equals the scene's text at that moment, including updates that were still in the log.
2. Unit: the automatic rule creates one snapshot when a scene with words and no snapshot gets its first update; none on the second update; none when the newest snapshot is 10 minutes old; one when it is 31 minutes old; none for a scene with no words; none when the stored state equals the newest snapshot.
3. Unit: with 35 automatic and 5 manual snapshots of one scene, a further automatic one leaves 30 non-manual and 5 manual.
4. Browser, both engines: take a snapshot, change the text, restore; the scene's plain text and marks equal the snapshot's; a "Before restore" snapshot exists holding the changed text.
5. One Undo after a restore brings back the changed text.
6. Restoring a snapshot whose text carries a provenance mark keeps the mark and its generation id.
7. Restore works on a scene that is mounted in the editor, without the editor being rebuilt: the slot's DOM node is the same before and after.
8. Compare shows a word added to the middle of one paragraph as one underlined word and collapses the unchanged paragraphs.
9. Deleting a scene for good deletes its snapshots.
10. The panel shows the snapshots of the scene holding the caret and updates when the caret moves to another scene.
11. No axe violations with the panel open and with a comparison shown.

## Performance budgets

On the fixture, both engines, added to `tests/perf/`.

| Budget | Threshold | Spike B, for comparison |
|---|---|---|
| Snapshot one scene, in the worker | at most 50 ms, including the 10,000-word scene | at most 4 ms |
| Restore a scene of up to 3,000 words, from confirming to the text painted | at most 100 ms | 17 to 30 ms for the document change |
| Restore the 10,000-word scene | at most 250 ms | 78 to 182 ms |
| Comparing two versions of the 10,000-word scene | at most 200 ms at four times CPU slowdown | not measured |
| Typing with the automatic rule active | write batch stays within the package 03 threshold of 20 ms | |

## Accessibility and mobile

- The list is a list of buttons with a menu each. In a comparison, removed and added text is marked with `<del>` and `<ins>` and with visible text style, not colour alone.
- On narrow screens the panel is a bottom sheet and a comparison fills the screen with a close button.

## Out of scope

Snapshots of a whole project at once (a backup does that). Comparing two snapshots with each other. Restoring part of a snapshot. Snapshots of folders or of the tree. Side-by-side comparison.

## Dependencies

Packages 03 and 04. Package 05 for the end-to-end tests.
