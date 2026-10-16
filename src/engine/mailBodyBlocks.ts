// A hand-made table in a mail body: the sender padded columns with runs of
// spaces (or tabs) to line up in the client's proportional font, which can't
// be reproduced in ours, or wrote markdown-style `| a | b |` pipe rows. Detect
// those rows and let the caller render a real table instead.

const MIN_CELLS = 3;
const MIN_PIPE_CELLS = 2;
const MIN_ROWS = 2;
const NUMERIC = /^[~+-]?\d[\d,.\s]*[a-zA-Z%]{0,3}$/;
const PIPE_SEPARATOR = /^:?-{2,}:?$/;

/** A separator row of a markdown pipe table: carries no data. */
const SEPARATOR = Symbol('separator');

function pipeCellsOf(line: string): CellSpan[] | typeof SEPARATOR | null {
  const lead = line.search(/\S/);
  if (lead < 0 || line[lead] !== '|') return null;
  const bodyStart = lead + 1;
  let bodyEnd = line.trimEnd().length;
  if (bodyEnd > bodyStart && line[bodyEnd - 1] === '|') bodyEnd--;
  const cells: CellSpan[] = [];
  let pos = bodyStart;
  for (const piece of line.slice(bodyStart, Math.max(bodyStart, bodyEnd)).split('|')) {
    const text = piece.trim();
    const start = pos + (piece.length - piece.trimStart().length);
    cells.push({ text, start, end: start + text.length });
    pos += piece.length + 1;
  }
  if (cells.length < MIN_PIPE_CELLS) return null;
  return cells.every((c) => PIPE_SEPARATOR.test(c.text)) ? SEPARATOR : cells;
}

function spaceCellsOf(line: string): CellSpan[] | null {
  // A cell is a run of words joined by single spaces; tabs or 2+ spaces split cells.
  const cells = Array.from(line.matchAll(/\S+(?: \S+)*/g), (m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
  return cells.length >= MIN_CELLS ? cells : null;
}

function cellsOf(line: string): CellSpan[] | typeof SEPARATOR | null {
  return pipeCellsOf(line) ?? spaceCellsOf(line);
}

function alignOf(rows: string[][]): ('left' | 'right')[] {
  const width = Math.max(...rows.map((r) => r.length));
  return Array.from({ length: width }, (_, col) => {
    // Row 0 is the header; a short row leaves its trailing columns empty.
    const body = rows.slice(1).flatMap((r) => (r[col] === undefined ? [] : [r[col]]));
    return body.length > 0 && body.every((c) => NUMERIC.test(c)) ? 'right' : 'left';
  });
}

/** A cell's text and its `[start, end)` offsets within its line. */
export interface CellSpan {
  text: string;
  start: number;
  end: number;
}

/** A block of consecutive lines: `[start, end)` indexes into the input lines. */
export type MailLineBlock =
  | { kind: 'text'; start: number; end: number }
  | {
      kind: 'table';
      start: number;
      end: number;
      rows: string[][];
      /** Per row and cell: where the cell sits in its line, so a caller can keep its formatting. */
      spans: CellSpan[][];
      /** The input line index each row came from. */
      rowLines: number[];
      align: ('left' | 'right')[];
    };

/**
 * Split a body's lines into prose and table ranges. A table is space-aligned
 * columns or markdown pipe rows (`| a | b |`, optional `|---|---|` separator).
 */
export function splitMailLines(lines: readonly string[]): MailLineBlock[] {
  const blocks: MailLineBlock[] = [];
  let proseStart = 0;
  let i = 0;

  while (i < lines.length) {
    const first = cellsOf(lines[i]);
    if (first === null || first === SEPARATOR) {
      i++;
      continue;
    }
    // Gather tabular lines, tolerating blank lines between them.
    const spans = [first];
    const rowLines = [i];
    let end = i + 1; // exclusive end of the consumed lines
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue;
      const cells = cellsOf(lines[j]);
      if (cells === null) break;
      if (cells !== SEPARATOR) {
        spans.push(cells);
        rowLines.push(j);
      }
      end = j + 1;
    }
    if (spans.length < MIN_ROWS) {
      i++;
      continue;
    }
    if (i > proseStart) blocks.push({ kind: 'text', start: proseStart, end: i });
    const rows = spans.map((r) => r.map((c) => c.text));
    blocks.push({ kind: 'table', start: i, end, rows, spans, rowLines, align: alignOf(rows) });
    i = proseStart = end;
  }
  if (proseStart < lines.length)
    blocks.push({ kind: 'text', start: proseStart, end: lines.length });
  return blocks;
}
