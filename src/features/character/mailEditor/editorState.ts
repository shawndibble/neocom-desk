import type { Editor } from '@tiptap/core';
import type { Mark } from '@tiptap/pm/model';
import { formatStateOfRuns, type FormatRun, type FormatState } from '@/engine/mailFormat';

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
