import { describe, it, expect } from 'vitest';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';

describe('parseAppraisalPaste', () => {
  it('reads a bare item name as a quantity of one', () => {
    expect(parseAppraisalPaste('Damage Control II')).toEqual([
      { name: 'Damage Control II', quantity: 1, lines: [1] },
    ]);
  });

  it('reads EVE’s tab-separated inventory copy', () => {
    expect(parseAppraisalPaste('Damage Control II\t3')).toEqual([
      { name: 'Damage Control II', quantity: 3, lines: [1] },
    ]);
  });

  it('keeps only name and quantity from a wide inventory copy', () => {
    // "Name<tab>Qty<tab>Group<tab>Volume" — the shape EVE gives when the
    // inventory is in details mode.
    const text = 'Tritanium\t124,500\tMineral\t1,245 m3';
    expect(parseAppraisalPaste(text)).toEqual([
      { name: 'Tritanium', quantity: 124500, lines: [1] },
    ]);
  });

  it('parses a thousands-separated quantity', () => {
    expect(parseAppraisalPaste('Tritanium\t124,500')).toEqual([
      { name: 'Tritanium', quantity: 124500, lines: [1] },
    ]);
  });

  it('parses a space-separated multibuy quantity', () => {
    expect(parseAppraisalPaste('Nocxium 220')).toEqual([
      { name: 'Nocxium', quantity: 220, lines: [1] },
    ]);
  });

  it('parses an xN quantity suffix', () => {
    expect(parseAppraisalPaste('Warp Disruptor II x4')).toEqual([
      { name: 'Warp Disruptor II', quantity: 4, lines: [1] },
    ]);
  });

  /**
   * The trap a naive `/(.+)\s+(\d+)$/` falls into: plenty of real type names
   * end in a number, and eating it leaves a name that resolves to nothing.
   */
  it('does not mistake a trailing model number for a quantity', () => {
    expect(parseAppraisalPaste("Zainou 'Gnome' Shield Management SM-703")).toEqual([
      { name: "Zainou 'Gnome' Shield Management SM-703", quantity: 1, lines: [1] },
    ]);
  });

  it('takes a space-separated quantity only when it is a standalone number', () => {
    expect(parseAppraisalPaste('Quafe Zero 10')).toEqual([
      { name: 'Quafe Zero', quantity: 10, lines: [1] },
    ]);
  });

  it('skips blank lines and keeps 1-indexed line numbers', () => {
    const text = ['Tritanium\t100', '', '   ', 'Pyerite\t200'].join('\n');
    expect(parseAppraisalPaste(text)).toEqual([
      { name: 'Tritanium', quantity: 100, lines: [1] },
      { name: 'Pyerite', quantity: 200, lines: [4] },
    ]);
  });

  it('merges repeated names into one entry, summing quantity', () => {
    const text = ['Tritanium\t100', 'Pyerite\t5', 'Tritanium\t50'].join('\n');
    expect(parseAppraisalPaste(text)).toEqual([
      { name: 'Tritanium', quantity: 150, lines: [1, 3] },
      { name: 'Pyerite', quantity: 5, lines: [2] },
    ]);
  });

  it('merges names differing only by case, keeping the first spelling', () => {
    expect(parseAppraisalPaste('Tritanium\t100\ntritanium\t50')).toEqual([
      { name: 'Tritanium', quantity: 150, lines: [1, 2] },
    ]);
  });

  it('handles CRLF and CR line endings', () => {
    expect(parseAppraisalPaste('Tritanium\t100\r\nPyerite\t200\rIsogen\t5')).toEqual([
      { name: 'Tritanium', quantity: 100, lines: [1] },
      { name: 'Pyerite', quantity: 200, lines: [2] },
      { name: 'Isogen', quantity: 5, lines: [3] },
    ]);
  });

  it('falls back to one when the stated quantity is not a positive number', () => {
    expect(parseAppraisalPaste('Tritanium\t0')).toEqual([
      { name: 'Tritanium', quantity: 1, lines: [1] },
    ]);
    expect(parseAppraisalPaste('Pyerite\t-5')).toEqual([
      { name: 'Pyerite', quantity: 1, lines: [1] },
    ]);
  });

  it('returns nothing for empty or whitespace-only text', () => {
    expect(parseAppraisalPaste('')).toEqual([]);
    expect(parseAppraisalPaste('  \n\n \t \n')).toEqual([]);
  });
});
