// Deterministic stress screenplay in Fountain (our own text, fixed seed).
// Covers: long dialogue runs that must split with (MORE)/(CONT'D), parentheticals inside speeches,
// many short scenes, 1-6 line action paragraphs, transitions, dual dialogue, forced page breaks
// (rare), long names, lines with no spaces.
// Usage: bun run tools/gen-stress.ts <pages> <seed> > out.fountain  (also imported by the demo and tests)

export function generateStress(pages: number, seedIn = 7): string {
let seed = seedIn
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)]
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))

const words = (
  'the a and of to in it is was he she they we you that with for on as at by this had not but from or have an ' +
  'door window light rain table glass street car phone letter river field kitchen stairs coat hand face voice ' +
  'quietly slowly suddenly almost never always again outside inside behind beneath across toward ' +
  'looks turns waits listens opens closes takes drops finds holds pulls pushes watches runs stops breathes ' +
  'old cold small bright empty narrow broken heavy careful nervous tired well-lit half-open twenty-two'
).split(' ')
const names = ['ANNA', 'BEN', 'CLARA', 'DMITRI', 'ELENA', 'FRANK', 'GRETA', 'HUGO', 'MRS. OKONKWO-HALVORSEN', 'DR. LIND']
const places = ['KITCHEN', 'STAIRWELL', 'PARKING LOT', 'TRAIN PLATFORM', 'HOSPITAL CORRIDOR', 'ROOFTOP', 'CAR', 'FIELD']
const times = ['DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MORNING']
const parens = ['(beat)', '(quietly)', '(to Ben)', '(not looking up)', '(into the phone, too loud for the room)', '(beat; then, carefully, as if rehearsed)']

function sentence(min = 4, max = 14): string {
  const n = int(min, max)
  const w: string[] = []
  for (let i = 0; i < n; i++) w.push(pick(words))
  const s = w.join(' ')
  return s[0].toUpperCase() + s.slice(1) + pick(['.', '.', '.', '?', '!', ' --', '...'])
}
function para(sentences: number) {
  const out: string[] = []
  for (let i = 0; i < sentences; i++) out.push(sentence())
  return out.join(' ')
}

const out: string[] = ['Title: Stress Script', 'Author: Spike C generator', '']
// a page is roughly 54 lines; estimate lines as we go
let lines = 0
let scene = 0
while (lines < pages * 50) {
  scene++
  out.push(`${pick(['INT.', 'EXT.', 'INT./EXT.'])} ${pick(places)} ${scene} - ${pick(times)}`, '')
  lines += 2
  const beats = scene % 9 === 0 ? 1 : int(2, 8)
  for (let b = 0; b < beats; b++) {
    const r = rnd()
    if (r < 0.3) {
      const s = int(1, 7)
      const p = para(s)
      out.push(p, '')
      lines += Math.ceil(p.length / 60) + 1
    } else if (r < 0.85) {
      const name = pick(names)
      out.push(name)
      lines += 1
      const long = rnd() < 0.2
      const chunks = long ? int(3, 6) : int(1, 2)
      for (let c = 0; c < chunks; c++) {
        if (c > 0 || rnd() < 0.3) { out.push(pick(parens)); lines += 1 }
        const d = para(long ? int(3, 6) : int(1, 3))
        out.push(d)
        lines += Math.ceil(d.length / 35)
      }
      out.push('')
      lines += 1
    } else if (r < 0.92) {
      const a = pick(names)
      let bn = pick(names)
      if (bn === a) bn = names[(names.indexOf(a) + 1) % names.length]
      const d1 = para(int(1, 3))
      const d2 = para(int(1, 4))
      out.push(a, d1, '', bn + ' ^', d2, '')
      lines += Math.max(Math.ceil(d1.length / 27), Math.ceil(d2.length / 27)) + 2
    } else if (r < 0.97) {
      out.push(pick(['CUT TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:']), '')
      lines += 2
    } else {
      out.push('!' + 'A'.repeat(int(10, 30)) + 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '')
      lines += 3
    }
  }
  if (scene % 97 === 0) out.push('===', '')
}
out.push('FADE OUT.')
return out.join('\n') + '\n'
}

if (import.meta.main) process.stdout.write(generateStress(Number(process.argv[2] ?? 120), Number(process.argv[3] ?? 7)))
