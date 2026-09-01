import { describe, it, expect } from 'vitest';
import { toCsv, csvFilename } from './csv';

interface Row {
  name: string;
  qty: number;
}

const columns = [
  { header: 'Name', value: (r: Row) => r.name },
  { header: 'Qty', value: (r: Row) => r.qty },
];

describe('toCsv', () => {
  it('prefixes formula-injection-triggering string fields (=, +, -, @, tab, CR) with a single quote', () => {
    const rows: Row[] = [
      { name: '=SUM(A1:A9)', qty: 1 },
      { name: '+1', qty: 2 },
      { name: '@cmd', qty: 3 },
      { name: '\tindented', qty: 4 },
      { name: '\rcr', qty: 5 },
      { name: '-lookup', qty: 6 },
    ];
    const csv = toCsv(rows, columns);
    expect(csv).toContain("'=SUM(A1:A9)");
    expect(csv).toContain("'+1");
    expect(csv).toContain("'@cmd");
    expect(csv).toContain("'\tindented");
    expect(csv).toContain("'\rcr");
    expect(csv).toContain("'-lookup");
  });

  it('sanitizes past leading whitespace, which a first-character check would miss', () => {
    const csv = toCsv([{ name: '  =cmd|calc', qty: 1 }], columns);
    expect(csv).toContain("'  =cmd|calc");
  });

  it('leaves a negative number bare, so numeric columns stay numeric in Excel', () => {
    const csv = toCsv([{ name: 'fee', qty: -1500 }], columns);
    expect(csv).toContain('fee,-1500');
    expect(csv).not.toContain("'-1500");
  });

  it('emits a leading UTF-8 BOM', () => {
    expect(toCsv([], columns).startsWith('﻿')).toBe(true);
  });

  it('emits exactly one BOM, never two — a call site prepending its own would double it silently', () => {
    const csv = toCsv([{ name: 'a', qty: 1 }], columns);
    expect(csv.match(new RegExp('\u{FEFF}', 'gu'))).toHaveLength(1);
  });

  it('quotes fields containing the delimiter, a double quote, CR, or LF, doubling internal quotes', () => {
    const rows: Row[] = [
      { name: 'Widget, Large', qty: 1 },
      { name: 'Say "hi"', qty: 2 },
      { name: 'multi\nline', qty: 3 },
    ];
    const csv = toCsv(rows, columns);
    expect(csv).toContain('"Widget, Large"');
    expect(csv).toContain('"Say ""hi"""');
    expect(csv).toContain('"multi\nline"');
  });

  it('terminates rows with CRLF', () => {
    const csv = toCsv([{ name: 'a', qty: 1 }], columns);
    expect(csv).toContain('\r\n');
    expect(csv).not.toMatch(/[^\r]\n/);
  });

  it('renders null/undefined as an empty field', () => {
    const nullableColumns = [
      { header: 'Name', value: () => null },
      { header: 'Qty', value: () => undefined },
    ];
    const csv = toCsv([{ name: 'a', qty: 1 }], nullableColumns);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toBe(',');
  });

  it('emits a header row from columns[].header, sanitized/quoted by the same rules', () => {
    const dangerousColumns = [{ header: '=HEADER', value: (r: Row) => r.name }];
    const csv = toCsv([{ name: 'a', qty: 1 }], dangerousColumns);
    expect(csv.split('\r\n')[0]).toBe("﻿'=HEADER");
  });

  it('emits only the header row for empty rows', () => {
    const csv = toCsv([], columns);
    expect(csv).toBe('﻿Name,Qty\r\n');
  });
});

describe('csvFilename', () => {
  it('stamps the local calendar date, zero-padded, onto a neocom- prefix', () => {
    expect(csvFilename('skills', new Date(2026, 7, 5))).toBe('neocom-skills-2026-08-05.csv');
  });

  it('uses local calendar parts, not the UTC date', () => {
    // 2026-01-01T00:30 local is still 2025-12-31 in UTC for any negative
    // offset — the file is named for the user's day, not Greenwich's.
    const localNewYear = new Date(2026, 0, 1, 0, 30);
    expect(csvFilename('jobs', localNewYear)).toBe('neocom-jobs-2026-01-01.csv');
  });

  it('appends -partial when options.partial is true, so a truncated export never looks complete', () => {
    expect(csvFilename('assets', new Date(2026, 7, 5), { partial: true })).toBe(
      'neocom-assets-2026-08-05-partial.csv'
    );
  });

  it('omits the suffix when options.partial is false or omitted', () => {
    expect(csvFilename('assets', new Date(2026, 7, 5), { partial: false })).toBe(
      'neocom-assets-2026-08-05.csv'
    );
    expect(csvFilename('assets', new Date(2026, 7, 5))).toBe('neocom-assets-2026-08-05.csv');
  });
});
