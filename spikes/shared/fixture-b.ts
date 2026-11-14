// Deterministic 300,000-word test project (fixed seed).
// About 150 chapters and 600 scenes; scene lengths 100..3,000 words, plus one
// 10,000-word scene as the worst case. Text is Zipf-distributed over a ~10,000
// word vocabulary so that index and compression sizes are in a realistic range.
// Known needles are planted for the search measurements.

export interface FixtureScene {
  id: string;
  index: number;
  title: string;
  words: number;
  paragraphs: string[];
}
export interface FixtureChapter {
  id: string;
  title: string;
  scenes: FixtureScene[];
}
export interface FixtureProject {
  seed: number;
  chapters: FixtureChapter[];
  totalWords: number;
  sceneCount: number;
  needles: typeof NEEDLES;
}

export const CHAPTERS = 150;
export const SCENES = 600;
export const TOTAL_WORDS = 300_000;
export const BIG_SCENE_INDEX = 300; // the 10,000-word scene
export const BIG_SCENE_WORDS = 10_000;

// Needles: scene indexes are fixed so the expected hit counts are known.
// Scenes that the spikes edit (2, 3, 30, 40 and the big scene) hold no needles.
export const NEEDLES = {
  rareWord: { q: 'quillfeather', scenes: [7, 93, 150, 222, 301, 414, 588] },
  phrase: { q: "lighthouse keeper's ledger", scenes: [12, 150, 302, 431, 577] },
  // Substring of "quillfeather": must not match as a whole word.
  substring: { q: 'illfeath', scenes: [7, 93, 150, 222, 301, 414, 588] },
  // Regular expression over all text; matches the rare word and the phrase.
  regex: { source: "quill\\w+|keeper's\\s+led\\w+", flags: 'g' },
  commonWord: { q: 'the' },
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMMON = (
  'the of and a to in is was he she it that his her with as for had you not be on at by ' +
  'this but from they have were one all we my said there would what so up out if about who ' +
  'which when them me no could into then do time like him your than some more now only over ' +
  'back know just down see little way before long made through still where after again never ' +
  'eyes hand thought away came went looked old good day head face night door room too much ' +
  'because house our own under last might each left right while found between always something ' +
  'nothing without heard took against light turned once another world though water voice life ' +
  'felt behind toward asked almost every moment stood open first two three years hands words ' +
  'morning seemed across around told began side knew upon enough place window street end quite ' +
  'mother father friend woman man child people road table letter city river garden winter summer'
).split(' ');

const ONSETS = ['b', 'br', 'c', 'ch', 'cl', 'cr', 'd', 'dr', 'f', 'fl', 'fr', 'g', 'gl', 'gr', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'pl', 'pr', 'qu', 'r', 's', 'sc', 'sh', 'sl', 'sm', 'sn', 'sp', 'st', 'str', 'sw', 't', 'th', 'tr', 'v', 'w', 'wh', ''];
const NUCLEI = ['a', 'e', 'i', 'o', 'u', 'ai', 'ea', 'ee', 'ie', 'oa', 'oo', 'ou', 'ay', 'ow'];
const CODAS = ['', '', 'b', 'd', 'g', 'k', 'l', 'll', 'm', 'n', 'nd', 'ng', 'nt', 'p', 'r', 'rd', 'rn', 's', 'ss', 'st', 't', 'th', 'x'];
const SUFFIX = ['', '', '', 's', 'ed', 'ing', 'ly', 'er', 'ness', 'ful'];

function buildVocabulary(rand: () => number, size: number): string[] {
  const seen = new Set<string>(COMMON);
  const vocab = [...COMMON];
  const reserved = new Set(['quillfeather', 'lighthouse', 'keeper', 'ledger']);
  while (vocab.length < size) {
    const syl = 1 + Math.floor(rand() * 3);
    let w = '';
    for (let s = 0; s < syl; s++) {
      w += ONSETS[Math.floor(rand() * ONSETS.length)] + NUCLEI[Math.floor(rand() * NUCLEI.length)] + CODAS[Math.floor(rand() * CODAS.length)];
    }
    w += SUFFIX[Math.floor(rand() * SUFFIX.length)];
    if (w.length < 3 || w.length > 14 || seen.has(w) || reserved.has(w) || w.startsWith('quill')) continue;
    seen.add(w);
    vocab.push(w);
  }
  return vocab;
}

/** Zipf sampler: cumulative weights 1/(rank+2.7)^1.05, binary search. */
function zipfSampler(n: number): (u: number) => number {
  const cum = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += 1 / Math.pow(i + 2.7, 1.05);
    cum[i] = acc;
  }
  return (u: number) => {
    const x = u * acc;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
}

function sceneLengths(rand: () => number): number[] {
  // 599 scenes in 100..3,000 words, skewed short, scaled to hit the total; one 10,000-word scene.
  const target = TOTAL_WORDS - BIG_SCENE_WORDS;
  const raw: number[] = [];
  for (let i = 0; i < SCENES - 1; i++) raw.push(100 + 2900 * Math.pow(rand(), 6.5));
  // Make sure both ends of the range occur.
  raw[0] = 100;
  raw[1] = 3000;
  let lens = raw.map((x) => Math.round(x));
  for (let pass = 0; pass < 20; pass++) {
    const sum = lens.reduce((a, b) => a + b, 0);
    if (sum === target) break;
    const k = target / sum;
    lens = lens.map((x, i) => (i < 2 ? x : Math.max(100, Math.min(3000, Math.round(x * k)))));
  }
  let diff = target - lens.reduce((a, b) => a + b, 0);
  for (let i = 2; diff !== 0 && i < lens.length; i++) {
    const step = Math.sign(diff) * Math.min(Math.abs(diff), 50);
    if (lens[i] + step >= 100 && lens[i] + step <= 3000) {
      lens[i] += step;
      diff -= step;
    }
  }
  lens.splice(BIG_SCENE_INDEX, 0, BIG_SCENE_WORDS);
  return lens;
}

function capital(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export function generateProject(seed = 20261111): FixtureProject {
  const rand = mulberry32(seed);
  const vocab = buildVocabulary(rand, 10_000);
  const zipf = zipfSampler(vocab.length);
  const lens = sceneLengths(rand);

  // Scenes per chapter: 2..6, summing to SCENES.
  const perChapter = new Array<number>(CHAPTERS).fill(4);
  for (let i = 0; i < 300; i++) {
    const a = Math.floor(rand() * CHAPTERS);
    const b = Math.floor(rand() * CHAPTERS);
    if (a !== b && perChapter[a] > 2 && perChapter[b] < 6) {
      perChapter[a]--;
      perChapter[b]++;
    }
  }

  const inScenes = (list: number[], i: number) => list.includes(i);
  const chapters: FixtureChapter[] = [];
  let sceneIndex = 0;
  let totalWords = 0;
  for (let c = 0; c < CHAPTERS; c++) {
    const chapter: FixtureChapter = {
      id: 'ch' + String(c + 1).padStart(3, '0'),
      title: `Chapter ${c + 1}: ${capital(vocab[200 + Math.floor(rand() * 2000)])}`,
      scenes: [],
    };
    for (let s = 0; s < perChapter[c]; s++) {
      const target = lens[sceneIndex];
      const paragraphs: string[] = [];
      let words = 0;
      while (words < target) {
        const paraTarget = Math.min(target - words, 20 + Math.floor(rand() * 110));
        const parts: string[] = [];
        let pw = 0;
        while (pw < paraTarget) {
          const sl = Math.min(paraTarget - pw, 4 + Math.floor(rand() * 21));
          const sw: string[] = [];
          for (let k = 0; k < sl; k++) sw.push(vocab[zipf(rand())]);
          sw[0] = capital(sw[0]);
          const comma = sl > 9 ? 3 + Math.floor(rand() * (sl - 5)) : -1;
          if (comma > 0) sw[comma] += ',';
          parts.push(sw.join(' ') + (rand() < 0.08 ? '?' : '.'));
          pw += sl;
        }
        paragraphs.push(parts.join(' '));
        words += pw;
      }
      // Plant needles by replacing words in the first paragraph (word count unchanged).
      const first = paragraphs[0].split(' ');
      if (inScenes(NEEDLES.rareWord.scenes, sceneIndex)) first[1] = 'quillfeather';
      if (inScenes(NEEDLES.phrase.scenes, sceneIndex)) {
        first[3] = 'lighthouse';
        first[4] = "keeper's";
        first[5] = 'ledger';
      }
      paragraphs[0] = first.join(' ');
      chapter.scenes.push({
        id: 'sc' + String(sceneIndex + 1).padStart(4, '0'),
        index: sceneIndex,
        title: `Scene ${sceneIndex + 1}`,
        words,
        paragraphs,
      });
      totalWords += words;
      sceneIndex++;
    }
    chapters.push(chapter);
  }
  return { seed, chapters, totalWords, sceneCount: sceneIndex, needles: NEEDLES };
}

export function sceneId(index: number): string {
  return 'sc' + String(index + 1).padStart(4, '0');
}
