import { getMarkRange, type Editor } from '@tiptap/core';
import type { Mark } from '@tiptap/pm/model';
import { CellSelection } from '@tiptap/pm/tables';
import {
  formatStateOfRuns,
  type FormatRun,
  type FormatState,
  type LinkTarget,
} from '@/engine/mail/mailFormat';

function runOf(marks: readonly Mark[]): FormatRun {
  const mark = (name: string) => marks.find((m) => m.type.name === name);
  const color = mark('eveColor')?.attrs.color;
  const px = mark('eveSize')?.attrs.px;
  const href = mark('link')?.attrs.href;
  return {
    bold: mark('bold') !== undefined,
    italic: mark('italic') !== undefined,
    underline: mark('underline') !== undefined,
    color: typeof color === 'string' ? color : null,
    size: typeof px === 'number' ? px : null,
    link: typeof href === 'string' ? href : null,
  };
}

/** The format at the caret, or over everything the selection covers. */
export function formatStateOfEditor(editor: Editor): FormatState {
  const { selection, doc, storedMarks } = editor.state;
  if (selection.empty) return formatStateOfRuns([runOf(storedMarks ?? selection.$from.marks())]);
  const runs: FormatRun[] = [];
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (node.isText) runs.push(runOf(node.marks));
  });
  return formatStateOfRuns(runs);
}

/**
 * The selection, the caret, or the whole link they sit in. A caret at a link's
 * edge is outside it (the mark is non-inclusive, as `formatStateOfEditor` reads
 * it); a selection counts as in the link only when wholly within its range.
 */
export function linkTargetOfEditor(editor: Editor): LinkTarget {
  const { selection, doc } = editor.state;
  const { from, to, empty } = selection;
  const type = editor.schema.marks.link;
  const range = type ? getMarkRange(doc.resolve(from), type) : undefined;
  const inside = range && (empty ? from > range.from && from < range.to : to <= range.to);
  if (range && inside) {
    const href = doc.nodeAt(range.from)?.marks.find((m) => m.type === type)?.attrs.href;
    return {
      from: range.from,
      to: range.to,
      text: doc.textBetween(range.from, range.to, ' '),
      href: typeof href === 'string' ? href : '',
    };
  }
  const markOnly =
    !empty &&
    (selection instanceof CellSelection || selection.$from.parent !== selection.$to.parent);
  return {
    from,
    to,
    text: empty || markOnly ? '' : doc.textBetween(from, to, ' '),
    href: null,
    ...(markOnly
      ? { markOnly, ranges: selection.ranges.map((r) => [r.$from.pos, r.$to.pos] as const) }
      : {}),
  };
}

/** The marks (minus any link) of the first character of the range, or at the caret. */
export function linkCarryMarks(editor: Editor, from: number): { type: string; attrs?: object }[] {
  const { selection, doc, storedMarks } = editor.state;
  const marks =
    selection.empty && selection.from === from
      ? (storedMarks ?? selection.$from.marks())
      : (doc.nodeAt(from)?.marks ?? []);
  return marks
    .filter((m) => m.type.name !== 'link')
    .map((m) => ({ type: m.type.name, attrs: m.attrs }));
}
