import {
  parseEveMarkup,
  markupPlainText,
  serializeEveMarkup,
  splitMarkupLines,
  classifyMarkupLink,
  type MarkupNode,
} from './eveMarkup';
import { buildPipeTableLines, splitPipeBlocks } from './mailFormat';

export interface EditorMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface EditorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
  text?: string;
  marks?: EditorMark[];
}
export interface EditorDoc {
  type: 'doc';
  content: EditorNode[];
}

export function plainTextToMarkup(text: string): string {
  return serializeEveMarkup([{ type: 'text', text }]);
}

export function draftMarkupBody(draft: { body: string; format?: 'markup' }): string {
  return draft.format === 'markup' ? draft.body : plainTextToMarkup(draft.body);
}

export function sanitizeMarkup(src: string): string {
  return serializeEveMarkup(parseEveMarkup(src));
}

const TAG_LIKE = /<\/?[a-zA-Z][^>]*>/g;

export function droppedMarkup(src: string): boolean {
  return (src.match(TAG_LIKE)?.length ?? 0) > (sanitizeMarkup(src).match(TAG_LIKE)?.length ?? 0);
}

function runsOf(nodes: readonly MarkupNode[], marks: EditorMark[]): EditorNode[] {
  return nodes.flatMap((node): EditorNode[] => {
    switch (node.type) {
      case 'text':
        return node.text === ''
          ? []
          : [{ type: 'text', text: node.text, ...(marks.length > 0 ? { marks } : {}) }];
      case 'br':
        return [{ type: 'hardBreak' }];
      case 'b':
        return runsOf(node.children, [...marks, { type: 'bold' }]);
      case 'i':
        return runsOf(node.children, [...marks, { type: 'italic' }]);
      case 'u':
        return runsOf(node.children, [...marks, { type: 'underline' }]);
      case 'size':
        return runsOf(node.children, [...marks, { type: 'eveSize', attrs: { px: node.px } }]);
      case 'color':
        return runsOf(node.children, [
          ...marks,
          { type: 'eveColor', attrs: { color: node.color } },
        ]);
      case 'link':
        return runsOf(node.children, [...marks, { type: 'link', attrs: { href: node.href } }]);
    }
  });
}

const paragraph = (content: EditorNode[]): EditorNode =>
  content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };

export function markupToDoc(src: string): EditorDoc {
  const lines = splitMarkupLines(parseEveMarkup(src));
  const blocks = splitPipeBlocks(lines.map((l) => markupPlainText(l)));
  const content: EditorNode[] = [];
  for (const block of blocks) {
    if (block.kind === 'text') {
      for (const line of lines.slice(block.start, block.end))
        content.push(paragraph(runsOf(line, [])));
    } else {
      content.push({
        type: 'table',
        content: block.rows.map((row, r) => ({
          type: 'tableRow',
          content: row.map((text) => ({
            type: r === 0 ? 'tableHeader' : 'tableCell',
            content: text === '' ? [] : [{ type: 'text', text }],
          })),
        })),
      });
    }
  }
  if (content.length === 0 || content[content.length - 1].type === 'table')
    content.push(paragraph([]));
  return { type: 'doc', content };
}

type Wrapper = Exclude<MarkupNode, { type: 'text' | 'br' }>;

function wrapperKey(n: MarkupNode): string | null {
  switch (n.type) {
    case 'b':
    case 'i':
    case 'u':
      return n.type;
    case 'size':
      return `size:${n.px}`;
    case 'color':
      return `color:${n.color}`;
    case 'link':
      return `link:${n.href}`;
    default:
      return null;
  }
}

function mergeAdjacent(nodes: MarkupNode[]): MarkupNode[] {
  const out: MarkupNode[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    const key = wrapperKey(node);
    if (prev && key !== null && key === wrapperKey(prev)) {
      (prev as Wrapper).children.push(...(node as Wrapper).children);
    } else {
      out.push(
        key === null ? node : ({ ...node, children: [...(node as Wrapper).children] } as Wrapper)
      );
    }
  }
  return out.map((n) =>
    wrapperKey(n) === null
      ? n
      : ({ ...n, children: mergeAdjacent((n as Wrapper).children) } as Wrapper)
  );
}

function nodesOfRun(run: EditorNode): MarkupNode[] {
  if (run.type === 'hardBreak') return [{ type: 'br' }];
  if (run.type !== 'text' || !run.text) return [];
  const has = (type: string) => run.marks?.some((m) => m.type === type) ?? false;
  const attr = (type: string, name: string) =>
    run.marks?.find((m) => m.type === type)?.attrs?.[name];
  let nodes: MarkupNode[] = [{ type: 'text', text: run.text }];
  if (has('underline')) nodes = [{ type: 'u', children: nodes }];
  if (has('italic')) nodes = [{ type: 'i', children: nodes }];
  if (has('bold')) nodes = [{ type: 'b', children: nodes }];
  const color = attr('eveColor', 'color');
  if (typeof color === 'string') nodes = [{ type: 'color', color, children: nodes }];
  const px = attr('eveSize', 'px');
  if (typeof px === 'number') nodes = [{ type: 'size', px, children: nodes }];
  const href = attr('link', 'href');
  if (typeof href === 'string') {
    const target = classifyMarkupLink(href);
    if (target) nodes = [{ type: 'link', href: href.trim(), target, children: nodes }];
  }
  return nodes;
}

function textOfCell(cell: EditorNode): string {
  return (cell.content ?? []).map((n) => (n.type === 'text' ? (n.text ?? '') : ' ')).join('');
}

export function docToMarkup(doc: EditorDoc): string {
  const blocks = [...doc.content];
  const last = blocks[blocks.length - 1];
  if (
    blocks.length > 1 &&
    last.type === 'paragraph' &&
    !last.content?.length &&
    blocks[blocks.length - 2].type === 'table'
  ) {
    blocks.pop();
  }
  const pieces = blocks.map((block) => {
    if (block.type === 'table') {
      const rows = (block.content ?? []).map((row) => (row.content ?? []).map(textOfCell));
      return buildPipeTableLines(rows).join('\n');
    }
    return serializeEveMarkup(mergeAdjacent((block.content ?? []).flatMap(nodesOfRun)));
  });
  return sanitizeMarkup(pieces.length === 1 && pieces[0] === '' ? '' : pieces.join('\n'));
}
