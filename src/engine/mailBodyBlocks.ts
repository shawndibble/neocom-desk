// A hand-made table in a mail body: the sender padded columns with runs of
// spaces (or tabs) to line up in the client's proportional font, which can't
// be reproduced in ours. Detect those rows and let the caller render a real
// table instead.

export type MailBodyBlock =
  { kind: 'text'; text: string } | { kind: 'table'; rows: string[][]; align: ('left' | 'right')[] };

const MIN_CELLS = 3;
const MIN_PIPE_CELLS = 2;
const MIN_ROWS = 2;
const NUMERIC = /^[~+-]?\d[\d,.\s]*[a-zA-Z%]{0,3}$/;
const PIPE_SEPARATOR = /^:?-{2,}:?$/;

/** A separator row of a markdown pipe table: carries no data. */
const SEPARATOR = Symbol('separator');

function pipeCellsOf(line: string): string[] | typeof SEPARATOR | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
  if (cells.length < MIN_PIPE_CELLS) return null;
  return cells.every((c) => PIPE_SEPARATOR.test(c)) ? SEPARATOR : cells;
}

function spaceCellsOf(line: string): string[] | null {
  const cells = line
    .trim()
    .split(/\t+| {2,}/)
    .map((c) => c.trim())
    .filter((c) => c !== '');
  return cells.length >= MIN_CELLS ? cells : null;
}

function cellsOf(line: string): string[] | typeof SEPARATOR | null {
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

/** A block of consecutive lines: `[start, end)` indexes into the input lines. */
export type MailLineBlock =
  | { kind: 'text'; start: number; end: number }
  | {
      kind: 'table';
      start: number;
      end: number;
      rows: string[][];
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
    const rows = [first];
    let end = i + 1; // exclusive end of the consumed lines
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue;
      const cells = cellsOf(lines[j]);
      if (cells === null) break;
      if (cells !== SEPARATOR) rows.push(cells);
      end = j + 1;
    }
    if (rows.length < MIN_ROWS) {
      i++;
      continue;
    }
    if (i > proseStart) blocks.push({ kind: 'text', start: proseStart, end: i });
    blocks.push({ kind: 'table', start: i, end, rows, align: alignOf(rows) });
    i = proseStart = end;
  }
  if (proseStart < lines.length)
    blocks.push({ kind: 'text', start: proseStart, end: lines.length });
  return blocks;
}

/** Split a stripped mail body into prose and table blocks. */
export function splitMailBody(text: string): MailBodyBlock[] {
  const lines = text.split('\n');
  const blocks = splitMailLines(lines).map((b): MailBodyBlock =>
    b.kind === 'table'
      ? { kind: 'table', rows: b.rows, align: b.align }
      : { kind: 'text', text: lines.slice(b.start, b.end).join('\n') }
  );
  return blocks.some((b) => b.kind === 'table') ? trimProseEdges(blocks) : blocks;
}

// Around a table the blocks' own spacing supplies the gap, so a prose block's
// leading and trailing blank lines would only double it.
function trimProseEdges(blocks: MailBodyBlock[]): MailBodyBlock[] {
  return blocks.flatMap((b): MailBodyBlock[] => {
    if (b.kind === 'table') return [b];
    const text = b.text.replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, '');
    return text.trim() === '' ? [] : [{ kind: 'text', text }];
  });
}
