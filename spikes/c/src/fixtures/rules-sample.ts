// A short script of our own that puts several break rules near page ends.
const long = (n: number, w: string) => Array.from({ length: n }, (_, i) => `${w} ${i + 1} is a complete sentence with a few more words.`).join(' ')

export const rulesSample = `Title: Rules Sample

EXT. HARBOUR - DAWN

${long(6, 'Action sentence')}

${long(5, 'Another sentence')}

MARA
${long(4, 'Dialogue sentence')}

JONAS
(quietly)
Short reply.

${long(7, 'More action')}

MARA
${long(3, 'First part')}
(beat)
${long(3, 'Second part')}

CUT TO:

INT. BOATHOUSE - CONTINUOUS

${long(8, 'Filler sentence')}

INT. HARBOUR OFFICE - LATER

MARA
Left column speech, short.

JONAS ^
Right column speech that is clearly longer than the left one and wraps over several lines.

${long(9, 'Closing sentence')}

MARA
${long(12, 'Very long speech')}

FADE OUT.
`
