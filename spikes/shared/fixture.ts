// Deterministic 300,000-word test project (fixed seed).
// About 150 chapters and 600 scenes, scene lengths 100..3000 words, plus one
// 10,000-word scene as the worst case. Framework-free: plain data only.

export type MarkKind = 0 | 1 | 2 // 0 plain, 1 italic, 2 bold

export interface Run {
  text: string
  mark: MarkKind
}

export type BlockType = 'p' | 'quote' | 'break' | 'h'

export interface Block {
  type: BlockType
  runs: Run[]
}

export interface Scene {
  id: string
  index: number
  chapter: number
  title: string
  words: number
  chars: number
  blocks: Block[]
}

export interface Chapter {
  index: number
  title: string
  sceneStart: number
  sceneCount: number
  words: number
}

export interface Project {
  seed: number
  chapters: Chapter[]
  scenes: Scene[]
  words: number
  /** Index of the scene that is exactly 500 words, in the middle of the project. */
  midScene: number
  /** Index of the 10,000-word scene. */
  bigScene: number
}

export interface FixtureOptions {
  seed?: number
  chapters?: number
  scenes?: number
  totalWords?: number
  bigSceneWords?: number
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Function words are drawn far more often than content words, which gives a
// realistic share of very common words ("the" is about 6% of all words).
const FUNCTION_WORDS = (
  'the the the the the the the the of of of and and and and a a a to to to in in is it that was was he she for on ' +
  'with as his her at by had not but from they her him this which or were we an there been their one all would ' +
  'when so no if out up into them then could now than only its over my me you what did about after before'
).split(' ')

const CONTENT_WORDS = (
  'house river morning window letter garden silence street winter shadow kitchen mother father door table night ' +
  'light water voice hand road station harbour island summer evening stone glass paper story memory question ' +
  'answer brother sister doctor soldier teacher captain stranger village mountain forest field bridge market ' +
  'church school office engine train boat horse dog bird rain snow wind fire smoke dust salt bread coffee wine ' +
  'walked looked turned waited opened closed carried remembered listened answered whispered laughed stood sat ' +
  'watched followed found left returned wrote read spoke asked knew thought wanted needed believed forgot ' +
  'promised crossed climbed reached held dropped lifted pulled pushed counted folded burned buried ' +
  'old young quiet narrow heavy bright cold warm dark pale empty careful sudden distant familiar strange ' +
  'small long slow early late broken wooden iron silver yellow green grey white black red blue ' +
  'slowly quietly suddenly carefully again always never almost already still together alone outside inside ' +
  'somewhere nowhere perhaps certainly barely gently finally nearly once twice often seldom ' +
  'afternoon minute hour year week month century moment distance corner ceiling floor stair wall roof ' +
  'pocket coat hat shoe ring key lamp clock mirror photograph newspaper telephone radio suitcase ticket ' +
  'argument promise secret truth lie mistake accident reason chance trouble courage patience grief relief'
).split(/\s+/)

const NAMES = 'Anna Tomas Ingrid Mikael Sara Elias Karin Johan Lena Oskar Maja Viktor Edith Nils Ruth Aron'.split(' ')

const TITLE_WORDS = (
  'Harbour Winter Letters Silence Crossing Garden Station Island Ashes Salt Glass Morning Departure Return ' +
  'Debt Promise Witness Flood Harvest Lantern Orchard Tide Ferry Archive Verdict Fever Thaw Embers'
).split(/\s+/)

export function generateProject(options: FixtureOptions = {}): Project {
  const seed = options.seed ?? 20261111
  const chapterCount = options.chapters ?? 150
  const sceneCount = options.scenes ?? 600
  const totalWords = options.totalWords ?? 300_000
  const bigWords = options.bigSceneWords ?? 10_000
  const rng = mulberry32(seed)
  const pick = <T,>(list: T[]): T => list[Math.floor(rng() * list.length)]

  // ---- scene lengths -------------------------------------------------------
  const midScene = Math.floor(sceneCount / 2)
  const bigScene = Math.min(sceneCount - 1, Math.floor(sceneCount * 0.7))
  const lengths = new Array<number>(sceneCount).fill(0)
  const fixed = new Set<number>()
  if (sceneCount > 2 && totalWords >= bigWords + 500 + (sceneCount - 2) * 100) {
    lengths[midScene] = 500
    lengths[bigScene] = bigWords
    fixed.add(midScene)
    fixed.add(bigScene)
  }
  const fixedSum = [...fixed].reduce((sum, i) => sum + lengths[i], 0)
  const freeTarget = totalWords - fixedSum
  // Log-normal draw, clamped to 100..3000.
  const gauss = () => {
    let u = 0
    let v = 0
    while (u === 0) u = rng()
    while (v === 0) v = rng()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const raw: number[] = []
  for (let i = 0; i < sceneCount; i++) raw.push(Math.exp(Math.log(380) + 0.75 * gauss()))
  const clamp = (n: number) => Math.max(100, Math.min(3000, Math.round(n)))
  let scale = 1
  for (let pass = 0; pass < 8; pass++) {
    let sum = 0
    for (let i = 0; i < sceneCount; i++) if (!fixed.has(i)) sum += clamp(raw[i] * scale)
    scale *= freeTarget / sum
  }
  let freeSum = 0
  for (let i = 0; i < sceneCount; i++) {
    if (fixed.has(i)) continue
    lengths[i] = clamp(raw[i] * scale)
    freeSum += lengths[i]
  }
  // Put the rounding remainder on scenes that have room for it.
  let diff = freeTarget - freeSum
  for (let i = 0; diff !== 0 && i < sceneCount * 4; i++) {
    const k = i % sceneCount
    if (fixed.has(k)) continue
    const step = Math.sign(diff) * Math.min(Math.abs(diff), 50)
    const next = lengths[k] + step
    if (next < 100 || next > 3000) continue
    lengths[k] = next
    diff -= step
  }

  // ---- chapters ------------------------------------------------------------
  const perChapter = new Array<number>(chapterCount).fill(Math.min(2, Math.floor(sceneCount / chapterCount)))
  let assigned = perChapter.reduce((a, b) => a + b, 0)
  while (assigned < sceneCount) {
    perChapter[Math.floor(rng() * chapterCount)]++
    assigned++
  }

  // ---- text ----------------------------------------------------------------
  const word = (): string => (rng() < 0.47 ? pick(FUNCTION_WORDS) : pick(CONTENT_WORDS))

  const sentence = (maxWords: number): string[] => {
    const n = Math.max(1, Math.min(maxWords, 4 + Math.floor(rng() * rng() * 26)))
    const words: string[] = []
    for (let i = 0; i < n; i++) {
      let w = rng() < 0.04 ? pick(NAMES) : word()
      if (i > 2 && i < n - 2 && rng() < 0.09) w += ','
      words.push(w)
    }
    words[0] = words[0][0].toUpperCase() + words[0].slice(1)
    const r = rng()
    words[n - 1] += r < 0.86 ? '.' : r < 0.94 ? '?' : '!'
    return words
  }

  const paragraph = (budget: number): { block: Block; words: number } => {
    const dialogue = rng() < 0.28
    const target = Math.min(budget, dialogue ? 4 + Math.floor(rng() * 30) : 25 + Math.floor(rng() * 110))
    const words: string[] = []
    while (words.length < target) words.push(...sentence(target - words.length))
    if (dialogue) {
      words[0] = '“' + words[0]
      words[words.length - 1] += '”'
    }
    const runs: Run[] = []
    const r = rng()
    if (words.length > 12 && r < 0.12) {
      // One emphasised run inside the paragraph.
      const start = 2 + Math.floor(rng() * (words.length - 8))
      const len = 1 + Math.floor(rng() * 5)
      runs.push({ text: words.slice(0, start).join(' ') + ' ', mark: 0 })
      runs.push({ text: words.slice(start, start + len).join(' '), mark: r < 0.03 ? 2 : 1 })
      runs.push({ text: ' ' + words.slice(start + len).join(' '), mark: 0 })
    } else {
      runs.push({ text: words.join(' '), mark: 0 })
    }
    const type: BlockType = !dialogue && rng() < 0.015 ? 'quote' : 'p'
    return { block: { type, runs }, words: words.length }
  }

  const scenes: Scene[] = []
  const chapters: Chapter[] = []
  let sceneIndex = 0
  for (let c = 0; c < chapterCount; c++) {
    const chapterTitle = `Chapter ${c + 1}: ${pick(TITLE_WORDS)} and ${pick(TITLE_WORDS)}`
    const chapter: Chapter = { index: c, title: chapterTitle, sceneStart: sceneIndex, sceneCount: perChapter[c], words: 0 }
    for (let s = 0; s < perChapter[c]; s++) {
      const target = lengths[sceneIndex]
      const blocks: Block[] = []
      let words = 0
      let chars = 0
      let sinceBreak = 0
      while (words < target) {
        const { block, words: n } = paragraph(target - words)
        blocks.push(block)
        words += n
        sinceBreak += n
        for (const run of block.runs) chars += run.text.length
        if (sinceBreak > 900 && target - words > 200 && rng() < 0.5) {
          blocks.push({ type: 'break', runs: [] })
          sinceBreak = 0
        }
      }
      const title = `${pick(TITLE_WORDS)} ${pick(CONTENT_WORDS)}`
      scenes.push({
        id: `s${String(sceneIndex).padStart(4, '0')}`,
        index: sceneIndex,
        chapter: c,
        title: `Ch ${c + 1} · Sc ${s + 1} · ${title}`,
        words,
        chars,
        blocks,
      })
      chapter.words += words
      sceneIndex++
    }
    chapters.push(chapter)
  }

  return {
    seed,
    chapters,
    scenes,
    words: scenes.reduce((sum, scene) => sum + scene.words, 0),
    midScene,
    bigScene,
  }
}
