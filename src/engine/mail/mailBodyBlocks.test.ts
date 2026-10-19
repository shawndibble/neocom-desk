import { describe, it, expect } from 'vitest';
import { splitMailLines } from '@/engine/mail/mailBodyBlocks';

type Block =
  { kind: 'text'; text: string } | { kind: 'table'; rows: string[][]; align: ('left' | 'right')[] };

/** The prose/table split the reader makes, as plain data: blank edges around a table trimmed. */
function splitMailBody(text: string): Block[] {
  const lines = text.split('\n');
  const found = splitMailLines(lines);
  const hasTable = found.some((b) => b.kind === 'table');
  return found.flatMap((b): Block[] => {
    if (b.kind === 'table') return [{ kind: 'table', rows: b.rows, align: b.align }];
    const body = lines.slice(b.start, b.end).join('\n');
    const t = hasTable ? body.replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, '') : body;
    return hasTable && t.trim() === '' ? [] : [{ kind: 'text', text: t }];
  });
}

const MOON = [
  'Greetings Pilots,',
  '',
  'Name                     m3           Value ISK     Rate %    Tax ISK        ** Tax Left **      Tax Paid',
  'Mero Otichoda         928,150.00     108,616,031.00    6       6,516,962.00    4,006,437.00    2,510,525.00',
  '',
  'LittleLiljtime             8,680.00       1,124,928.00    6          67,496.00       67,496.00',
  '',
  'Olorf               1,115,070.00     153,435,290.00    6       9,206,117.00    9,206,117.00',
  '',
  '',
  'I hope to see taxes paid before saturday 17th october.',
].join('\n');

describe('splitMailBody', () => {
  it('returns one text block when nothing looks like a table', () => {
    const text = 'Hello pilot.\n\nSee you at the gate  tonight.';
    expect(splitMailBody(text)).toEqual([{ kind: 'text', text }]);
  });

  it('turns a hand-spaced block into a table, skipping blank rows between lines', () => {
    const blocks = splitMailBody(MOON);
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'table', 'text']);
    const table = blocks[1];
    if (table.kind !== 'table') throw new Error('expected table');
    expect(table.rows[0]).toEqual([
      'Name',
      'm3',
      'Value ISK',
      'Rate %',
      'Tax ISK',
      '** Tax Left **',
      'Tax Paid',
    ]);
    expect(table.rows[2]).toEqual([
      'LittleLiljtime',
      '8,680.00',
      '1,124,928.00',
      '6',
      '67,496.00',
      '67,496.00',
    ]);
    expect(table.rows).toHaveLength(4);
  });

  it('keeps prose around the table and trims the blank lines around it', () => {
    const blocks = splitMailBody(MOON);
    expect(blocks[0]).toEqual({ kind: 'text', text: 'Greetings Pilots,' });
    expect(blocks[2]).toEqual({
      kind: 'text',
      text: 'I hope to see taxes paid before saturday 17th october.',
    });
  });

  it('right-aligns columns whose body cells are all numbers', () => {
    const table = splitMailBody(MOON)[1];
    if (table.kind !== 'table') throw new Error('expected table');
    expect(table.align).toEqual(['left', 'right', 'right', 'right', 'right', 'right', 'right']);
  });

  it('trims cells when tabs and spaces are mixed', () => {
    const table = splitMailBody('A \tB\t C\n1\t2 \t3')[0];
    if (table.kind !== 'table') throw new Error('expected table');
    expect(table.rows[0]).toEqual(['A', 'B', 'C']);
  });

  it('splits on tabs too', () => {
    const blocks = splitMailBody('A\tB\tC\n1\t2\t3');
    expect(blocks).toEqual([
      {
        kind: 'table',
        rows: [
          ['A', 'B', 'C'],
          ['1', '2', '3'],
        ],
        align: ['right', 'right', 'right'],
      },
    ]);
  });

  it('does not treat a lone spaced line as a table', () => {
    const text = 'Total     12     34\nthanks';
    expect(splitMailBody(text)).toEqual([{ kind: 'text', text }]);
  });

  it('does not treat lines with only two cells as a table', () => {
    const text = 'Name    Bob\nShip    Rifter';
    expect(splitMailBody(text)).toEqual([{ kind: 'text', text }]);
  });
});

describe('pipe tables', () => {
  it('reads | a | b | rows, skipping the separator row', () => {
    const text = 'Intro\n\n| Name | ISK |\n|---|---:|\n| Olorf | 1,200 |\n| Mero | 90 |\n\nBye';
    expect(splitMailBody(text)).toEqual([
      { kind: 'text', text: 'Intro' },
      {
        kind: 'table',
        rows: [
          ['Name', 'ISK'],
          ['Olorf', '1,200'],
          ['Mero', '90'],
        ],
        align: ['left', 'right'],
      },
      { kind: 'text', text: 'Bye' },
    ]);
  });

  it('works without a separator row and with two columns', () => {
    const blocks = splitMailBody('| a | b |\n| c | d |');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('table');
  });

  it('leaves a lone pipe line as prose', () => {
    const text = '| just one row |';
    expect(splitMailBody(text)).toEqual([{ kind: 'text', text }]);
  });
});

describe('splitMailLines', () => {
  it('gives each cell its offsets in its line', () => {
    const [table] = splitMailLines(['a  b  c', 'd  e  f']).filter((b) => b.kind === 'table');
    expect(table.kind === 'table' && table.spans[0].map((c) => [c.start, c.end])).toEqual([
      [0, 1],
      [3, 4],
      [6, 7],
    ]);
    const [pipe] = splitMailLines(['| ab | c |', '|---|---|', '| d | e |']);
    expect(pipe.kind === 'table' && pipe.spans[0].map((c) => [c.start, c.end])).toEqual([
      [2, 4],
      [7, 8],
    ]);
    expect(pipe.kind === 'table' && pipe.rowLines).toEqual([0, 2]);
  });

  it('reports the line range of each block', () => {
    const blocks = splitMailLines(['hi', '| a | b |', '| c | d |', 'bye']);
    expect(blocks.map((b) => [b.kind, b.start, b.end])).toEqual([
      ['text', 0, 1],
      ['table', 1, 3],
      ['text', 3, 4],
    ]);
  });
});
