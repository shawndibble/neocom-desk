import { clamp } from '../math';

export interface LineSpan {
  start: number;
  end: number;
  text: string;
}

export function lineAt(text: string, caret: number): LineSpan {
  const at = clamp(caret, 0, text.length);
  const start = text.lastIndexOf('\n', at - 1) + 1;
  const newline = text.indexOf('\n', at);
  const end = newline === -1 ? text.length : newline;
  return { start, end, text: text.slice(start, end) };
}

export function namesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export function isMultiLine(text: string): boolean {
  return text.trim().includes('\n') || /\n\s*\S/.test(text);
}

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
