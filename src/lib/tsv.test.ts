import { describe, it, expect } from 'vitest';
import { toTsv } from './tsv';

interface Row {
  name: string;
  qty: number | null;
  at?: string;
}

const columns = [
  { header: 'Name', value: (r: Row) => r.name },
  { header: 'Qty', value: (r: Row) => r.qty },
  { header: 'Issued', value: (r: Row) => r.at },
];

describe('toTsv', () => {
  it('writes a header row and tab-separated data rows with no BOM', () => {
    const tsv = toTsv(
      [{ name: 'Cap Booster 200', qty: 3993, at: '2026-09-28T03:32:04Z' }],
      columns
    );
    expect(tsv).toBe('Name\tQty\tIssued\nCap Booster 200\t3993\t2026-09-28 03:32:04\n');
  });

  it('keeps spaces and commas inside a cell — they are not separators here', () => {
    const tsv = toTsv([{ name: 'Widget, Large Mk II', qty: 1 }], columns);
    expect(tsv.split('\n')[1].split('\t')[0]).toBe('Widget, Large Mk II');
  });

  it('flattens tabs and line breaks inside a cell so a row can never split', () => {
    const tsv = toTsv([{ name: 'a\tb\r\nc', qty: 1 }], columns);
    expect(tsv.split('\n')).toHaveLength(3);
    expect(tsv.split('\n')[1].split('\t')).toHaveLength(3);
    expect(tsv.split('\n')[1].split('\t')[0]).toBe('a b c');
  });

  it('guards formula-looking text with a leading apostrophe', () => {
    const tsv = toTsv([{ name: '=HYPERLINK("x")', qty: 1 }], columns);
    expect(tsv.split('\n')[1].split('\t')[0]).toBe('\'=HYPERLINK("x")');
  });

  it('leaves negative numbers bare so they paste as numbers', () => {
    const tsv = toTsv([{ name: 'fee', qty: -1500 }], columns);
    expect(tsv.split('\n')[1].split('\t')[1]).toBe('-1500');
  });

  it('renders an empty value as an empty cell', () => {
    const tsv = toTsv([{ name: 'a', qty: null }], columns);
    expect(tsv.split('\n')[1]).toBe('a\t\t');
  });
});
