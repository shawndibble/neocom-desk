import { describe, expect, it } from 'vitest';
import { MARKET_WIDE_PAGE_SIZE, topRows } from './marketWidePage';

interface Row {
  id: number;
  iskPerHour: number;
  buildCost: number;
}

/** Row `i` earns `1000 - i` ISK/h, so the ISK/h ranking is id order. */
const rows: Row[] = Array.from({ length: 450 }, (_, i) => ({
  id: i,
  iskPerHour: 1000 - i,
  buildCost: i === 250 ? 1 : 10_000 + i,
}));
const byIskPerHour = (row: Row) => row.iskPerHour;
const byBuildCost = (row: Row) => row.buildCost;

describe('topRows', () => {
  it('pages in 200s', () => {
    expect(MARKET_WIDE_PAGE_SIZE).toBe(200);
  });

  it('keeps only the first `limit` rows of the ranking', () => {
    const shown = topRows(rows, byIskPerHour, 'desc', 200);
    expect(shown).toHaveLength(200);
    expect(shown[0]?.id).toBe(0);
    expect(shown[199]?.id).toBe(199);
  });

  it('cuts after sorting, so a re-sort reaches past the first page', () => {
    // #250 is outside the ISK/h top 200 but the cheapest build of all.
    expect(topRows(rows, byIskPerHour, 'desc', 200).map((r) => r.id)).not.toContain(250);
    expect(topRows(rows, byBuildCost, 'asc', 200)[0]?.id).toBe(250);
  });

  it('grows by another page without reordering what was already shown', () => {
    const first = topRows(rows, byIskPerHour, 'desc', 200);
    const more = topRows(rows, byIskPerHour, 'desc', 400);
    expect(more).toHaveLength(400);
    expect(more.slice(0, 200)).toEqual(first);
  });

  it('returns every row once the limit passes the end', () => {
    expect(topRows(rows, byIskPerHour, 'desc', 600)).toHaveLength(450);
  });

  it('keeps input order when there is no sort', () => {
    expect(topRows(rows, undefined, 'desc', 3).map((r) => r.id)).toEqual([0, 1, 2]);
  });
});
