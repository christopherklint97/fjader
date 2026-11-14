import type { Profile } from './types'

/**
 * afterwriting's "usletter" print profile (js/utils/print-profiles.js, MIT, Copyright (c) 2015-2020
 * Piotr Jamróz), with its liner rules. Used to check that the port reproduces afterwriting exactly.
 * Blank lines come from the Fountain source (merged to one), as in afterwriting.
 */
export const afterwritingUsLetter: Profile = {
  name: 'afterwriting-usletter',
  pageWidth: 8.5,
  pageHeight: 11,
  topMargin: 1.0,
  linesPerPage: 55,
  lineHeight: 0.1667,
  charWidth: 0.1,
  fontSize: 12,
  pageNumberTop: 0.5,
  pageNumberRight: 1.5 + 6.1,
  elements: {
    scene_heading: { indent: 1.5, width: 61, spaceBefore: 1 },
    action: { indent: 1.5, width: 61, spaceBefore: 1 },
    shot: { indent: 1.5, width: 61, spaceBefore: 1 },
    character: { indent: 3.5, width: 33, spaceBefore: 1 },
    parenthetical: { indent: 3.0, width: 26, spaceBefore: 0 },
    dialogue: { indent: 2.5, width: 36, spaceBefore: 0 },
    // right-aligned to action.feed + action.max * font_width
    transition: { indent: 1.5, width: 61, spaceBefore: 1, align: 'right' },
    centered: { indent: 1.5, width: 61, spaceBefore: 1, align: 'center' },
  },
  dualWidthFactor: 0.75,
  more: '(MORE)',
  contd: "(CONT'D)",
  rules: 'afterwriting',
  breakAtSentences: false,
  minActionBefore: 2,
  minActionAfter: 2,
  minDialogueBefore: 1,
  minDialogueAfter: 2,
  sourceSpacing: true,
  contdInMargin: false,
  moreInMargin: false,
  parentheticalBeforeMore: false,
  moreKind: 'parenthetical',
  hyphenBreaks: false,
}

/**
 * US feature screenplay, docs/PLAN.md section 8, with Final Draft's default element settings
 * as found in a Final Draft file (fountain.io's Brick & Steel FDX): action 1.5-7.5 in,
 * character 3.5 in, parenthetical 3.0-5.5 in with a -0.1 in first-line indent, dialogue
 * 2.5-6.0 in, transition right-aligned at 7.1 in. Top and bottom margins 1 in: 9 in of body at
 * 6 lines per inch = 54 lines. The character indent is a setting (Nicholl: 4.0-4.2 in; Final
 * Draft blog: about 3.7 in); it never changes a page break unless a name is longer than its width.
 */
export const usFeature: Profile = {
  name: 'us-feature',
  pageWidth: 8.5,
  pageHeight: 11,
  topMargin: 1.0,
  linesPerPage: 54,
  lineHeight: 1 / 6,
  charWidth: 0.1,
  fontSize: 12,
  pageNumberTop: 0.5,
  pageNumberRight: 7.5,
  elements: {
    scene_heading: { indent: 1.5, width: 60, spaceBefore: 1 },
    action: { indent: 1.5, width: 60, spaceBefore: 1 },
    shot: { indent: 1.5, width: 60, spaceBefore: 1 },
    character: { indent: 3.7, width: 35, spaceBefore: 1 },
    parenthetical: { indent: 3.0, width: 25, firstIndent: -0.1, spaceBefore: 0 },
    dialogue: { indent: 2.5, width: 35, spaceBefore: 0 },
    transition: { indent: 5.5, width: 16, spaceBefore: 1, align: 'right' },
    centered: { indent: 1.5, width: 60, spaceBefore: 1, align: 'center' },
  },
  dualWidthFactor: 0.75,
  more: '(MORE)',
  contd: "(CONT'D)",
  rules: 'fd',
  breakAtSentences: true,
  minActionBefore: 2,
  minActionAfter: 2,
  minDialogueBefore: 2,
  minDialogueAfter: 2,
  sourceSpacing: false,
  // Final Draft 8 behaviour measured in its PDFs (results file, section 2)
  contdInMargin: true,
  moreInMargin: true,
  parentheticalBeforeMore: false,
  moreKind: 'character',
  hyphenBreaks: true,
}

export const profiles: Record<string, Profile> = {
  [afterwritingUsLetter.name]: afterwritingUsLetter,
  [usFeature.name]: usFeature,
}
