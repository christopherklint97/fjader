import { Schema, Node as PMNode, type NodeSpec, type MarkSpec } from 'prosemirror-model'
import type { Block, Project, Scene } from '../../shared/fixture'

// Prose profile only: paragraph, heading, scene break, block quote, italic, bold.
const blockNodes: Record<string, NodeSpec> = {
  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM: () => ['p', 0],
  },
  heading: {
    attrs: { level: { default: 3 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [
      { tag: 'h2', attrs: { level: 2 } },
      { tag: 'h3', attrs: { level: 3 } },
    ],
    toDOM: (node) => ['h' + node.attrs.level, 0],
  },
  blockquote: {
    content: 'paragraph+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM: () => ['blockquote', 0],
  },
  scene_break: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM: () => ['hr'],
  },
  text: { group: 'inline' },
}

const marks: Record<string, MarkSpec> = {
  em: { parseDOM: [{ tag: 'i' }, { tag: 'em' }], toDOM: () => ['em', 0] },
  strong: { parseDOM: [{ tag: 'b' }, { tag: 'strong' }], toDOM: () => ['strong', 0] },
}

/** Variant 3: one document per scene. */
export const sceneSchema = new Schema({
  nodes: { doc: { content: 'block+' }, ...blockNodes },
  marks,
})

/** Variants 1 and 2: the whole project in one document, chapter > scene > blocks. */
export const projectSchema = new Schema({
  nodes: {
    doc: { content: 'chapter+' },
    chapter: {
      content: 'heading scene+',
      attrs: { index: { default: 0 }, est: { default: 1000 } },
      isolating: true,
      // The size hint only has an effect when the container enables
      // content-visibility (variant 2). "auto" lets the browser remember the
      // real size once the chapter has been rendered.
      toDOM: (node) => [
        'section',
        {
          class: 'chapter',
          'data-chapter': String(node.attrs.index),
          style: `contain-intrinsic-block-size: auto ${node.attrs.est}px`,
        },
        0,
      ],
      parseDOM: [{ tag: 'section.chapter' }],
    },
    scene: {
      content: 'block+',
      attrs: { index: { default: 0 } },
      toDOM: (node) => ['div', { class: 'scene', 'data-scene': String(node.attrs.index) }, 0],
      parseDOM: [{ tag: 'div.scene' }],
    },
    ...blockNodes,
  },
  marks,
})

function blockToNode(schema: Schema, block: Block): PMNode {
  const n = schema.nodes
  if (block.type === 'break') return n.scene_break.create()
  const inline = block.runs
    .filter((run) => run.text.length > 0)
    .map((run) =>
      schema.text(run.text, run.mark === 1 ? [schema.marks.em.create()] : run.mark === 2 ? [schema.marks.strong.create()] : undefined),
    )
  if (block.type === 'h') return n.heading.create({ level: 3 }, inline)
  const para = n.paragraph.create(null, inline)
  return block.type === 'quote' ? n.blockquote.create(null, [para]) : para
}

export function sceneBlocks(schema: Schema, scene: Scene): PMNode[] {
  return scene.blocks.map((block) => blockToNode(schema, block))
}

export function buildSceneDoc(scene: Scene): PMNode {
  return sceneSchema.nodes.doc.create(null, sceneBlocks(sceneSchema, scene))
}

export function buildProjectDoc(project: Project, estimateChapterHeight: (chapter: number) => number): PMNode {
  const n = projectSchema.nodes
  const chapters = project.chapters.map((chapter) => {
    const kids: PMNode[] = [n.heading.create({ level: 2 }, projectSchema.text(chapter.title))]
    for (let s = chapter.sceneStart; s < chapter.sceneStart + chapter.sceneCount; s++) {
      kids.push(n.scene.create({ index: s }, sceneBlocks(projectSchema, project.scenes[s])))
    }
    return n.chapter.create({ index: chapter.index, est: Math.round(estimateChapterHeight(chapter.index)) }, kids)
  })
  return n.doc.create(null, chapters)
}
