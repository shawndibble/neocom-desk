import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

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

  it('leaves a negative number bare, so numeric columns stay numeric in Excel', () => {
    // The column's return type is the seam: a `number` cannot carry a
    // formula, and quote-prefixing it would import every ISK column as text.
    const csv = toCsv([{ name: 'fee', qty: -1500 }], columns);
    expect(csv).toContain('fee,-1500');
    expect(csv).not.toContain("'-1500");
  });

  it('emits a leading UTF-8 BOM', () => {
    expect(toCsv([], columns).startsWith('﻿')).toBe(true);
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
