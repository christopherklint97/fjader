// Spike C paginator: shared types. Pure data, no DOM.

export type ElementType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot'
  | 'centered'
  | 'page_break'

/** One element of the script, as the editor model would hold it. */
export interface Element {
  id: string
  type: ElementType
  text: string
  /** Dual dialogue: the left or right column. Applies to character, parenthetical and dialogue. */
  dual?: 'left' | 'right'
  /**
   * Blank lines before this element. Undefined means "use the profile's spaceBefore".
   * The Fountain loader sets it from the source so the afterwriting comparison sees
   * exactly the blank lines afterwriting sees.
   */
  blankBefore?: number
}

export interface ElementStyle {
  /** Left edge of the text, inches from the left edge of the paper. */
  indent: number
  /** Maximum characters per line. */
  width: number
  /** Blank lines before the element (dropped at the top of a page). */
  spaceBefore: number
  /** First-line indent relative to indent, inches (Final Draft parenthetical: -0.1). Widens the first line. */
  firstIndent?: number
  align?: 'left' | 'right' | 'center'
}

export type RuleSet = 'afterwriting' | 'fd'

export interface Profile {
  name: string
  pageWidth: number
  pageHeight: number
  /** Inches from the top edge to the first body line's top. */
  topMargin: number
  /** Body lines per page. */
  linesPerPage: number
  /** Inches. 12 pt Courier at 6 lines per inch is 1/6. */
  lineHeight: number
  /** Inches. 10 pitch is 0.1. */
  charWidth: number
  fontSize: number
  pageNumberTop: number
  /** Right edge of the page number, inches from the left. */
  pageNumberRight: number
  elements: Record<Exclude<ElementType, 'page_break'>, ElementStyle>
  /** Dual dialogue: widths are multiplied by this factor (afterwriting: 0.75). */
  dualWidthFactor: number
  more: string
  contd: string
  rules: RuleSet
  /** fd rules only. */
  breakAtSentences: boolean
  /** fd rules only: minimum lines of a split action paragraph before and after the break. */
  minActionBefore: number
  minActionAfter: number
  /** fd rules only: minimum dialogue lines of a split speech before (MORE) and after the break. */
  minDialogueBefore: number
  minDialogueAfter: number
  /** Use Element.blankBefore when set (Fountain source spacing) instead of spaceBefore. */
  sourceSpacing: boolean
  /** Where (MORE) is printed: afterwriting puts it at the parenthetical indent, Final Draft at the character indent. */
  moreKind: 'parenthetical' | 'character'
  /** fd rules: the carried NAME (CONT'D) sits in the top margin and takes no body line (Final Draft 8). */
  contdInMargin: boolean
  /** fd rules: (MORE) may sit one row below the last body row (Final Draft 8). */
  moreInMargin: boolean
  /** fd rules: a parenthetical may be the last line before (MORE) (Final Draft 8 does it; the spec forbids it). */
  parentheticalBeforeMore: boolean
  /** fd rules: wrap may break after a hyphen. */
  hyphenBreaks: boolean
}

export type LineKind = Exclude<ElementType, 'page_break'> | 'blank' | 'more' | 'contd' | 'page_break' | 'pad'

/** One printed line. Positions are derived from kind + profile, so editor and PDF share them. */
export interface Line {
  /** Text as printed. */
  t: string
  /** Display kind (decides the indent). */
  k: LineKind
  /** Rule type, the afterwriting token type the line belongs to (a (MORE) line belongs to the dialogue token). */
  r: ElementType | 'separator'
  /** Element index in the input array, -1 for synthetic lines. */
  e: number
  /** Line index within the element. */
  li: number
  /** Number of lines of the element (of the re-wrapped rest, for a split paragraph's continuation). */
  n: number
  /** Offset of the line's first character in the element text. */
  o?: number
  /** Dual dialogue: set on dual lines; 'left' lines may carry the right column. */
  dual?: 'left' | 'right'
  right?: Line[]
}

export interface PageStart {
  /** Index into the flat line stream of the first line that is not the carry line. */
  cursor: number
  /** (CONT'D) character line carried over from a split speech, printed first. */
  carry: Line | null
  /** fd rules: re-wrapped rest of a paragraph split at a sentence end, printed after the carry. */
  rest?: Line[] | null
}

export interface Page {
  lines: Line[]
  start: PageStart
}

export interface PaginateResult {
  pages: Page[]
  /** Flat line stream the pages were cut from (blank lines included). */
  stream: Line[]
  /** Element index -> first stream index of its lines (or of its blank lines). */
  elementStart: Int32Array
  ms?: number
}
