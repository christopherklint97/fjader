import type { Element } from '../paginator/types'

/** One printed row, ready to draw: [row, x (inches), text, element index, kind]. */
export type RenderRow = [number, number, string, number, string]
export interface RenderPage {
  rows: RenderRow[]
}

export type ToPaginator =
  | { type: 'load'; elements: Element[]; profile: string }
  | { type: 'edit'; index: number; text: string; seq: number }
  | { type: 'repaginate' }
  | { type: 'export' }
  | { type: 'port'; port: MessagePort }

export type FromPaginator =
  | { type: 'full'; pageCount: number; ms: number; pages: RenderPage[] }
  | {
      type: 'update'
      seq: number
      pageCount: number
      /** Worker time for the incremental pagination of this update. */
      ms: number
      /** Edits merged into this update (typing faster than updates). */
      coalesced: number
      fromPage: number
      recomputed: number
      resynced: boolean
      changed: [number, RenderPage][]
    }
  | { type: 'repaginated'; ms: number; pageCount: number }
  | { type: 'exporting'; pages: number; cloneMs: number }

export type FromPdf = { type: 'pdf'; bytes: Uint8Array; ms: number; pages: number } | { type: 'pdf-error'; message: string }
