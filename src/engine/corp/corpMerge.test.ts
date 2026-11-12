import { describe, expect, it } from 'vitest';
import { mergeCorpRows, mergeLookups } from './corpMerge';

describe('mergeCorpRows', () => {
  const keyOf = (row: { id: number }) => String(row.id);

  it('lists every corporation’s rows and carries each row’s corporation by its key', () => {
    const merged = mergeCorpRows(
      [
        { corporationId: 10, rows: [{ id: 1 }, { id: 2 }] },
        { corporationId: 20, rows: [{ id: 3 }] },
      ],
      keyOf
    );
    expect(merged.rows.map((row) => row.id)).toEqual([1, 2, 3]);
    expect([...merged.corporationOf]).toEqual([
      ['1', 10],
      ['2', 10],
      ['3', 20],
    ]);
  });

  it('keeps a row two corporations both list once, under the first', () => {
    // A contract between two of the pilot's corporations is in both reads.
    const merged = mergeCorpRows(
      [
        { corporationId: 10, rows: [{ id: 7 }] },
        { corporationId: 20, rows: [{ id: 7 }, { id: 8 }] },
      ],
      keyOf
    );
    expect(merged.rows.map((row) => row.id)).toEqual([7, 8]);
    expect(merged.corporationOf.get('7')).toBe(10);
  });

  it('is empty with no reads', () => {
    const merged = mergeCorpRows<{ id: number }>([], keyOf);
    expect(merged.rows).toEqual([]);
    expect(merged.corporationOf.size).toBe(0);
  });
});

describe('mergeLookups', () => {
  it('holds every entry of every map', () => {
    const merged = mergeLookups([
      new Map([[1, 'Tama']]),
      new Map([
        [1, 'Tama'],
        [2, 'Efa'],
      ]),
    ]);
    expect([...merged]).toEqual([
      [1, 'Tama'],
      [2, 'Efa'],
    ]);
  });
});
