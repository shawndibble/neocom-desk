/**
 * The pilot-name box is one field of one name per line. These read it: which
 * line the caret is on (that is the name being typed, so it gets the
 * suggestions), which names are in it, and what a picked name does to it.
 */

export interface LineSpan {
  start: number;
  end: number;
  text: string;
}

/** The line the caret sits on; a caret at a line's end belongs to that line. */
export function lineAt(text: string, caret: number): LineSpan {
  const at = Math.min(Math.max(caret, 0), text.length);
  const start = text.lastIndexOf('\n', at - 1) + 1;
  const newline = text.indexOf('\n', at);
  const end = newline === -1 ? text.length : newline;
  return { start, end, text: text.slice(start, end) };
}

/** Every non-blank line, trimmed, in order. */
export function namesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** The box holds a list once it has more than one line, even if the second is still empty. */
export function isMultiLine(text: string): boolean {
  return text.trim().includes('\n') || /\n\s*\S/.test(text);
}

/** `text` with the caret's line replaced by `name`, and where the caret goes (the end of that line). */
export function replaceLine(
  text: string,
  caret: number,
  name: string
): { text: string; caret: number } {
  const line = lineAt(text, caret);
  return {
    text: text.slice(0, line.start) + name + text.slice(line.end),
    caret: line.start + name.length,
  };
}
