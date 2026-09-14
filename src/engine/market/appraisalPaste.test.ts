import { describe, it, expect } from 'vitest';
import { countPasteLines, parseAppraisalPaste } from '@/engine/market/appraisalPaste';

describe('countPasteLines', () => {
  it('counts the lines the parser would read, skipping blanks', () => {
    expect(countPasteLines(['Tritanium\t100', '', '   ', 'Pyerite\t200'].join('\n'))).toBe(2);
  });

  it('counts every line ending the same way', () => {
    expect(countPasteLines('a\r\nb\rc\nd')).toBe(4);
  });

  it('counts repeated names separately, unlike the parser’s merged entries', () => {
    const text = 'Tritanium\t100\nTritanium\t50';
    expect(countPasteLines(text)).toBe(2);
    expect(parseAppraisalPaste(text)).toHaveLength(1);
  });

  it('counts nothing in empty or whitespace-only text', () => {
    expect(countPasteLines('')).toBe(0);
    expect(countPasteLines('  \n\n \t \n')).toBe(0);
  });
});

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

describe('parseAppraisalPaste — EFT fits', () => {
  const FIT = [
    '[Rifter, Kite Fit]',
    '',
    'Nanofiber Internal Structure I',
    '[Empty Low slot]',
    '',
    '1MN Afterburner II',
    '',
    '125mm Gatling AutoCannon II, Republic Fleet EMP S',
    '125mm Gatling AutoCannon II, Republic Fleet EMP S',
    '',
    'Small Polycarbon Engine Housing I',
    '',
    'Warrior II x5',
    '',
    '',
    'Nanite Repair Paste x50',
  ].join('\n');

  it('prices the hull as its own entry, from the header line', () => {
    const entries = parseAppraisalPaste(FIT);
    expect(entries[0]).toEqual({ name: 'Rifter', quantity: 1, lines: [1] });
  });

  it('splits a "Module, Charge" line into two entries, both on that source line', () => {
    const entries = parseAppraisalPaste(FIT);
    const gun = entries.find((e) => e.name === '125mm Gatling AutoCannon II');
    const ammo = entries.find((e) => e.name === 'Republic Fleet EMP S');
    expect(gun).toEqual({ name: '125mm Gatling AutoCannon II', quantity: 2, lines: [8, 9] });
    expect(ammo).toEqual({ name: 'Republic Fleet EMP S', quantity: 2, lines: [8, 9] });
  });

  it('keeps drone and cargo xN counts, and skips [Empty X slot] placeholders', () => {
    const entries = parseAppraisalPaste(FIT);
    expect(entries.find((e) => e.name === 'Warrior II')).toEqual({
      name: 'Warrior II',
      quantity: 5,
      lines: [13],
    });
    expect(entries.find((e) => e.name === 'Nanite Repair Paste')).toEqual({
      name: 'Nanite Repair Paste',
      quantity: 50,
      lines: [16],
    });
    expect(entries.some((e) => e.name.startsWith('[Empty'))).toBe(false);
  });

  it('prices every line of the fit: hull, modules, rig, charges, drones, cargo', () => {
    expect(parseAppraisalPaste(FIT)).toEqual([
      { name: 'Rifter', quantity: 1, lines: [1] },
      { name: 'Nanofiber Internal Structure I', quantity: 1, lines: [3] },
      { name: '1MN Afterburner II', quantity: 1, lines: [6] },
      { name: '125mm Gatling AutoCannon II', quantity: 2, lines: [8, 9] },
      { name: 'Republic Fleet EMP S', quantity: 2, lines: [8, 9] },
      { name: 'Small Polycarbon Engine Housing I', quantity: 1, lines: [11] },
      { name: 'Warrior II', quantity: 5, lines: [13] },
      { name: 'Nanite Repair Paste', quantity: 50, lines: [16] },
    ]);
  });

  it('reports a malformed header as its own line, rather than dropping it', () => {
    const entries = parseAppraisalPaste('[ , Max Hacker]\n\nDamage Control II');
    // The header text is not an item name, so it resolves to nothing and the
    // panel lists it as an unmatched line — the same way a typo'd item name is
    // reported, never silently dropped.
    expect(entries).toEqual([
      { name: '[ , Max Hacker]', quantity: 1, lines: [1] },
      { name: 'Damage Control II', quantity: 1, lines: [3] },
    ]);
  });

  it('emits no hull entry when the header names no ship', () => {
    const entries = parseAppraisalPaste('[ , Max Hacker]\n\nDamage Control II');
    expect(entries.some((e) => e.name === '')).toBe(false);
  });

  it('reports an unparseable body line by its source line number', () => {
    const entries = parseAppraisalPaste('[Rifter, Kite Fit]\n\n, Republic Fleet EMP S');
    expect(entries).toEqual([
      { name: 'Rifter', quantity: 1, lines: [1] },
      { name: ', Republic Fleet EMP S', quantity: 1, lines: [3] },
    ]);
  });

  it('reads an unusable xN count as one, keeping the "always >= 1" promise', () => {
    // A zero would ride out into a share link, where decodeAppraisalShare
    // rejects the whole payload over one non-positive count.
    const entries = parseAppraisalPaste('[Rifter, Kite Fit]\n\nNanite Repair Paste x0');
    expect(entries).toEqual([
      { name: 'Rifter', quantity: 1, lines: [1] },
      { name: 'Nanite Repair Paste', quantity: 1, lines: [3] },
    ]);
  });

  it('leaves every non-EFT paste shape on the existing parser', () => {
    // A bracket only counts as a fit header on the first non-blank line.
    expect(parseAppraisalPaste('Tritanium\t100\n[Empty High slot]')).toEqual([
      { name: 'Tritanium', quantity: 100, lines: [1] },
      { name: '[Empty High slot]', quantity: 1, lines: [2] },
    ]);
  });
});
