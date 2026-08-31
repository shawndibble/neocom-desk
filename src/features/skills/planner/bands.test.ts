import { describe, it, expect } from 'vitest';
import { bandStarts } from './bands';
import { buildRows } from './markers';
import type { PlanEntry, PlanPriority } from '@/engine/types';

const entry = (skillTypeID: number, targetLevel = 1): PlanEntry => ({ skillTypeID, targetLevel });

const priorities = (pairs: [number, PlanPriority][]): Map<number, PlanPriority> => new Map(pairs);

describe('bandStarts', () => {
  it('is empty for no rows', () => {
    expect(bandStarts(buildRows([], undefined), new Map())).toEqual(new Map());
  });

  it('the first entry row always starts a band', () => {
    const rows = buildRows([entry(1)], undefined);
    expect(bandStarts(rows, priorities([[1, 'high']]))).toEqual(new Map([[rows[0].id, 'high']]));
  });

  it('consecutive entries with the same effective priority do not start a new band', () => {
    const rows = buildRows([entry(1), entry(2)], undefined);
    const result = bandStarts(
      rows,
      priorities([
        [1, 'high'],
        [2, 'high'],
      ])
    );
    expect(result.size).toBe(1);
    expect(result.get(rows[0].id)).toBe('high');
  });

  it('a priority change starts a new band', () => {
    const rows = buildRows([entry(1), entry(2), entry(3)], undefined);
    const result = bandStarts(
      rows,
      priorities([
        [1, 'high'],
        [2, 'high'],
        [3, 'low'],
      ])
    );
    expect([...result.entries()]).toEqual([
      [rows[0].id, 'high'],
      [rows[2].id, 'low'],
    ]);
  });

  it('treats an entry missing from the priority map as normal', () => {
    const rows = buildRows([entry(1)], undefined);
    expect(bandStarts(rows, new Map())).toEqual(new Map([[rows[0].id, 'normal']]));
  });

  it('a marker row does not start a band and does not reset the comparison', () => {
    const rows = buildRows([entry(1), entry(2)], [1]); // marker between entry 1 and 2
    const markerRow = rows.find((r) => r.kind === 'marker')!;
    const result = bandStarts(
      rows,
      priorities([
        [1, 'high'],
        [2, 'high'],
      ])
    );
    expect(result.has(markerRow.id)).toBe(false);
    expect(result.size).toBe(1);
  });
});
