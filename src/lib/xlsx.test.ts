import { describe, it, expect } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { toXlsx } from './xlsx';

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

function sheetXml(bytes: Uint8Array): string {
  return strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
}

describe('toXlsx', () => {
  it('produces a zip holding every part a spreadsheet app needs to open the workbook', () => {
    const files = unzipSync(toXlsx([], columns, 'Orders'));
    expect(Object.keys(files).sort()).toEqual(
      [
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/_rels/workbook.xml.rels',
        'xl/styles.xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ].sort()
    );
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Orders"');
  });

  it('writes text as inline strings, one cell per column, spaces intact', () => {
    const xml = sheetXml(toXlsx([{ name: 'Cap Booster 200', qty: 1 }], columns, 'Sheet'));
    expect(xml).toContain(
      '<c r="A2" t="inlineStr"><is><t xml:space="preserve">Cap Booster 200</t></is></c>'
    );
  });

  it('writes numbers as numeric cells', () => {
    const xml = sheetXml(toXlsx([{ name: 'a', qty: -1500.5 }], columns, 'Sheet'));
    expect(xml).toContain('<c r="B2"><v>-1500.5</v></c>');
  });

  it('writes ISO timestamps as date serials with a date style', () => {
    const xml = sheetXml(
      toXlsx([{ name: 'a', qty: 1, at: '2026-01-01T12:00:00Z' }], columns, 'Sheet')
    );
    // 2026-01-01 is Excel serial 46023; noon adds half a day.
    expect(xml).toContain('<c r="C2" s="2"><v>46023.5</v></c>');
  });

  it('omits empty cells', () => {
    const xml = sheetXml(toXlsx([{ name: 'a', qty: null }], columns, 'Sheet'));
    expect(xml).not.toContain('r="B2"');
  });

  it('bolds the header row and freezes it', () => {
    const xml = sheetXml(toXlsx([], columns, 'Sheet'));
    expect(xml).toContain(
      '<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Name</t></is></c>'
    );
    expect(xml).toContain('state="frozen"');
  });

  it('escapes XML metacharacters and drops characters XML cannot carry', () => {
    const xml = sheetXml(toXlsx([{ name: 'A & <B> "C"\u0001', qty: 1 }], columns, 'Sheet'));
    expect(xml).toContain('A &amp; &lt;B&gt; &quot;C&quot;</t>');
  });

  it('never turns formula-looking text into a formula', () => {
    const xml = sheetXml(toXlsx([{ name: '=SUM(A1)', qty: 1 }], columns, 'Sheet'));
    expect(xml).not.toContain('<f>');
    expect(xml).toContain('>=SUM(A1)</t>');
  });

  it('names columns past Z with two letters', () => {
    const wide = Array.from({ length: 28 }, (_, i) => ({ header: `H${i}`, value: () => i }));
    const xml = sheetXml(toXlsx([{}], wide, 'Sheet'));
    expect(xml).toContain('<c r="AB2"><v>27</v></c>');
  });

  it('sanitizes the sheet name to what Excel accepts', () => {
    const files = unzipSync(toXlsx([], columns, 'Orders: open/history [all]?*'));
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Orders open history all"');
  });
});
