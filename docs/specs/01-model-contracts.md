# Package 01: Model and contracts

## Goal

The pure domain code and the shared types that every other package compiles against: the prose schema, plain text and positions, order keys, provenance rules, conversion between stored bytes and editor documents, and the storage protocol's types. After this package, storage, state and editor work can proceed at the same time.

## User-visible behaviour

None.

## Contracts provided

All code is in `src/model/` except the protocol types. Nothing here touches the DOM, a worker API, or storage.

**`model/types.ts`**

```ts
export type ProjectId = string   // UUID
export type NodeId = string      // UUID
export type SceneId = NodeId     // the id of a node whose kind is 'scene'
export type SnapshotId = string

export type NodeStatus = 'none' | 'todo' | 'draft' | 'revised' | 'done'

export interface NodeRow {
  id: NodeId
  parentId: NodeId | null
  ord: string
  kind: 'folder' | 'scene'
  title: string
  synopsis: string
  status: NodeStatus
  labels: string[]
  words: number
  chars: number
  blocks: number
  createdAt: number
  updatedAt: number
  trashedAt: number | null
}
export type NodePatch = Partial<Pick<NodeRow, 'title' | 'synopsis' | 'status' | 'labels'>>

export interface Position { sceneId: SceneId; offset: number }
export interface TextRange { start: number; end: number }
export interface GoOptions { select?: { from: Position; to: Position }; focus?: boolean }   // for Navigator.goTo and EditorPane.jumpTo
export interface SceneStats { words: number; chars: number; blocks: number }
export interface SearchQuery { text: string; mode: 'text' | 'regex'; caseSensitive: boolean; wholeWord: boolean }

export interface ManuscriptInfo {
  byline: string          // the name printed under the title
  contact: string         // contact block, one line per line
  surname: string         // for the page header
  titleKeyword: string    // for the page header
  font: 'modern' | 'classic'
  endMark: boolean        // print "END" after the last line
}

export interface ProjectMeta {
  projectId: ProjectId
  title: string
  profile: 'prose'
  lang: string
  createdAt: number
  lastPosition: Position | null
  lastBackupAt: number | null
  changedSinceBackup: boolean
  targetWords: number | null
  targetDaily: number | null
  manuscript: ManuscriptInfo
}
export interface NewProject { title: string; lang: string }
export interface ProjectInfo { id: ProjectId; title: string; words: number; updatedAt: number; schemaVersion: number }
```

**`model/profile.ts` and `model/prose.ts`**: the `FormatProfile` interface and the `prose` profile, as in `architecture.md` section 4.1.

- `PaneLayout` is `{ contentWidth: number; charWidth: number; lineHeight: number; blockGap: number; scenePadding: number }`, all in CSS px.
- `prose.estimateHeight(stats, layout)` returns `2 * scenePadding + lines * lineHeight + blocks * blockGap`, where `lines = ceil(chars * 1.035 / (contentWidth / charWidth)) + ceil(blocks / 2)`. The factor 1.035 is the line-breaking waste Spike A measured; the second term is the half line each block wastes on average.
- `prose.keymap`: Enter splits the block; Enter in a heading starts a paragraph; Backspace at the start of a heading or block quote turns it into a paragraph. It contains no keys that cross scene boundaries.
- DOM output: `paragraph` is `<p dir="auto">`, `heading` is `<h3>` to `<h5>` for levels 1 to 3 (the pane uses `<h2>` for folder titles), `blockquote` is `<blockquote>`, `scene_break` is `<hr>`. `provenance` is `<span data-prov="ai|ai-edited" data-gen="…">`. The parse rule for `provenance` applies only inside an element carrying `data-fjader`, which the app's own clipboard HTML has (package 07).

**`model/text.ts`**: `plainText(doc)`, `posAtOffset(doc, offset)`, `offsetAtPos(doc, pos)`, `countWords(text)`, `statsOf(doc): SceneStats`, as in section 4.4.

**`model/order.ts`**: `keyBetween(before: string | null, after: string | null): string` and `keysBetween(before, after, count): string[]`, wrapping the `fractional-indexing` package.

**`model/tree.ts`**: pure functions over `NodeRow[]`.

```ts
export function childrenOf(rows: Iterable<NodeRow>, parentId: NodeId | null): NodeRow[]   // live, sorted by ord
export function manuscriptOrder(rows: Iterable<NodeRow>): SceneId[]
export function pathOf(rows: ReadonlyMap<NodeId, NodeRow>, id: NodeId): NodeRow[]         // top-level ancestor first
export function isChapter(rows: Iterable<NodeRow>, folderId: NodeId): boolean              // directly contains a live scene
export function isInTrash(rows: ReadonlyMap<NodeId, NodeRow>, id: NodeId): boolean         // the node or an ancestor is trashed
```

**`model/provenance.ts`**: `provenancePlugin(): Plugin`, implementing the rules of section 4.3.

**`model/convert.ts`**: the only code that converts between Yjs bytes and ProseMirror documents.

```ts
export const BODY = 'body'                                   // name of the Y.XmlFragment
export function ydocFromStored(state: Uint8Array | null, updates: Uint8Array[]): Y.Doc   // applied with origin 'load'
export function docFromYdoc(ydoc: Y.Doc, profile: FormatProfile): PMNode
export function stateFromDoc(doc: PMNode): Uint8Array        // a new Y.Doc's full state
export function emptySceneState(profile: FormatProfile): Uint8Array
```

**`storage/protocol.ts`**: every type in `architecture.md` section 6.3 (`StorageClient`, `StorageError`, `StorageEvent`, `StoredDoc`, `NewNode`) plus these, which later packages implement:

```ts
export interface SearchHit { sceneId: SceneId; range: TextRange; before: string; match: string; after: string }
export interface SearchResult {
  total: number
  scenes: { sceneId: SceneId; count: number }[]   // scenes with matches, manuscript order
  first: SearchHit[]                              // up to the requested limit
}
export type SnapshotKind = 'manual' | 'auto' | 'pre-restore' | 'pre-merge'
export interface SnapshotMeta { id: SnapshotId; sceneId: SceneId; createdAt: number; kind: SnapshotKind; name: string | null; words: number }
export interface Bookmark { id: string; sceneId: SceneId; offset: number; label: string; createdAt: number }
```

## Contracts consumed

Package 00: layout, test runner.

## Data model changes

None in the database. This package defines the document schema (section 4.1) and the Yjs layout (section 4.5).

## Acceptance criteria

All are unit tests.

1. For generated documents containing every node type and mark, `offsetAtPos(doc, posAtOffset(doc, n)) === n` for every offset `n` from 0 to `plainText(doc).length`.
2. `plainText` of a document with two paragraphs, a scene break and a block quote of two paragraphs is the five strings joined by `"\n"`, with an empty string for the break.
3. `docFromYdoc(ydocFromStored(stateFromDoc(doc), []), prose)` equals `doc` for the same generated documents, marks included.
4. `statsOf` returns the same word count as `countWords(plainText(doc))`.
5. `keyBetween` returns a key strictly between its arguments for 10,000 random insertions, including repeated insertion at the same place.
6. `manuscriptOrder` skips trashed nodes and the descendants of trashed folders, and orders by `ord` at every level.
7. Provenance: inserting a character strictly inside an `ai` span makes the whole span `ai-edited` and the new character carries the mark; deleting part of an `ai` span makes the rest `ai-edited`; typing at either edge of a span produces unmarked text; toggling italic over an `ai` span leaves it `ai`; no transaction turns `ai-edited` back into `ai` or into unmarked text other than by deleting it.
8. The schema rejects a document with no blocks and a block quote containing a heading.
9. Parsing `<span data-prov="ai" data-gen="x">` yields the mark inside an element with `data-fjader` and plain text outside one.
10. `storage/protocol.ts` compiles under `strict` with no `any`.

## Performance budgets

None directly. `statsOf` and `plainText` on a 10,000-word document each run in under 5 ms in the unit test environment, as a guard.

## Accessibility and mobile

Text blocks carry `dir="auto"` (`architecture.md` section 16).

## Out of scope

Any editor view, key handling across scenes, storage, the screenplay profile.

## Dependencies

Package 00.
