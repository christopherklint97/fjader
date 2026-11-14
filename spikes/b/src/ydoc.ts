// Yjs document shape and the deterministic typing simulation.
// The shape mimics what y-prosemirror stores: an XmlFragment of paragraph
// elements, each holding one XmlText. No editor is involved.
import * as Y from 'yjs';

export const FRAG = 'prosemirror';
export const IMPORT_CLIENT = 1;
export const TYPING_CLIENT = 2;

export function docFromParagraphs(paragraphs: string[], clientID = IMPORT_CLIENT): Y.Doc {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  const frag = doc.getXmlFragment(FRAG);
  doc.transact(() => {
    frag.insert(
      0,
      paragraphs.map((p) => {
        const el = new Y.XmlElement('paragraph');
        const t = new Y.XmlText();
        t.insert(0, p);
        el.insert(0, [t]);
        return el;
      }),
    );
  });
  return doc;
}

export function docFromState(state: Uint8Array | null, updates: Uint8Array[], clientID?: number): Y.Doc {
  const doc = new Y.Doc();
  if (clientID !== undefined) doc.clientID = clientID;
  if (state) Y.applyUpdate(doc, state, 'load');
  for (const u of updates) Y.applyUpdate(doc, u, 'load');
  return doc;
}

export function docParagraphs(doc: Y.Doc): string[] {
  const frag = doc.getXmlFragment(FRAG);
  const out: string[] = [];
  for (let i = 0; i < frag.length; i++) {
    const el = frag.get(i) as Y.XmlElement;
    const t = el.get(0) as Y.XmlText | undefined;
    out.push(t ? t.toString() : '');
  }
  return out;
}

export function docText(doc: Y.Doc): string {
  return docParagraphs(doc).join('\n');
}

export function countWords(text: string): number {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}

function hash32(i: number): number {
  let x = (i + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

const STREAM =
  'she set the lamp on the sill and waited for the tide to turn, counting the boats as they came in under the grey light of the morning. ';
const WORDS = STREAM.trim().split(' ');

/**
 * Apply typing change number `i` (1-based). Pure function of (i, document
 * state), so a run can be replayed for verification and resumed after a kill.
 * Mix: 88% type one character at the end, 4% backspace, 2% new paragraph,
 * 6% insert a word somewhere else in the scene.
 */
export function applyTypingChange(doc: Y.Doc, i: number): void {
  const frag = doc.getXmlFragment(FRAG);
  const h = hash32(i);
  const r = h % 100;
  doc.transact(() => {
    const n = frag.length;
    const lastEl = frag.get(n - 1) as Y.XmlElement;
    const last = lastEl.get(0) as Y.XmlText;
    const ch = STREAM[i % STREAM.length];
    if (r < 2) {
      const el = new Y.XmlElement('paragraph');
      el.insert(0, [new Y.XmlText()]);
      frag.insert(n, [el]);
    } else if (r < 6 && last.length > 0) {
      last.delete(last.length - 1, 1);
    } else if (r < 12) {
      const p = (h >>> 8) % n;
      const t = (frag.get(p) as Y.XmlElement).get(0) as Y.XmlText;
      const off = (h >>> 16) % (t.length + 1);
      t.insert(off, ' ' + WORDS[(h >>> 4) % WORDS.length]);
    } else {
      last.insert(last.length, ch);
    }
  }, 'typing');
}
