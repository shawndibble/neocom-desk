// A hand-made table in a mail body: the sender padded columns with runs of
// spaces (or tabs) to line up in the client's proportional font, which can't
// be reproduced in ours. Detect those rows and let the caller render a real
// table instead.

export type MailBodyBlock =
  { kind: 'text'; text: string } | { kind: 'table'; rows: string[][]; align: ('left' | 'right')[] };

const MIN_CELLS = 3;
const MIN_ROWS = 2;
const NUMERIC = /^[~+-]?\d[\d,.\s]*[a-zA-Z%]{0,3}$/;

function cellsOf(line: string): string[] | null {
  const cells = line
    .trim()
    .split(/\t+| {2,}/)
    .filter((c) => c !== '');
  return cells.length >= MIN_CELLS ? cells : null;
}

function alignOf(rows: string[][]): ('left' | 'right')[] {
  const width = Math.max(...rows.map((r) => r.length));
  return Array.from({ length: width }, (_, col) => {
    // Row 0 is the header; a short row leaves its trailing columns empty.
    const body = rows.slice(1).flatMap((r) => (r[col] === undefined ? [] : [r[col]]));
    return body.length > 0 && body.every((c) => NUMERIC.test(c)) ? 'right' : 'left';
  });
}

/** Split a stripped mail body into prose and table blocks. */
export function splitMailBody(text: string): MailBodyBlock[] {
  const lines = text.split('\n');
  const blocks: MailBodyBlock[] = [];
  let prose: string[] = [];
  let i = 0;

  const flushProse = (): void => {
    if (prose.length > 0) blocks.push({ kind: 'text', text: prose.join('\n') });
    prose = [];
  };

  while (i < lines.length) {
    const first = cellsOf(lines[i]);
    if (first === null) {
      prose.push(lines[i++]);
      continue;
    }
    // Gather tabular lines, tolerating blank lines between them.
    const rows = [first];
    let end = i + 1; // exclusive end of the consumed lines
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue;
      const cells = cellsOf(lines[j]);
      if (cells === null) break;
      rows.push(cells);
      end = j + 1;
    }
    if (rows.length < MIN_ROWS) {
      prose.push(lines[i++]);
      continue;
    }
    flushProse();
    blocks.push({ kind: 'table', rows, align: alignOf(rows) });
    i = end;
  }
  flushProse();
  return blocks;
}
