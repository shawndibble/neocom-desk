import { describe, expect, it } from 'vitest';
import { groupByMonth, kindCounts, newestFirst, type Interaction } from './interactions';

const at = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const row = (id: string, iso: string, extra: Partial<Interaction> = {}): Interaction => ({
  id,
  kind: 'wallet',
  at: at(iso),
  type: 'interactions.type.donation',
  tone: 'neutral',
  title: id,
  to: '/wallet',
  ...extra,
});

describe('newestFirst', () => {
  it('sorts by time descending and breaks ties by id so the order is stable', () => {
    const rows = [row('a', '2026-10-01'), row('c', '2026-11-01'), row('b', '2026-11-01')];
    expect(newestFirst(rows).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate its input', () => {
    const rows = [row('a', '2026-10-01'), row('b', '2026-11-01')];
    newestFirst(rows);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('groupByMonth', () => {
  it('groups by UTC month, newest month first, with item count and ISK net', () => {
    const groups = groupByMonth([
      row('a', '2026-11-14', { isk: 25 }),
      row('b', '2026-11-02', { isk: -10 }),
      row('c', '2026-10-30'),
    ]);
    expect(groups.map((g) => g.month)).toEqual(['2026-11', '2026-10']);
    expect(groups[0]!.items.map((r) => r.id)).toEqual(['a', 'b']);
    expect(groups[0]!.net).toBe(15);
    expect(groups[1]!.net).toBe(0);
  });

  it('puts a row at the month boundary in its UTC month', () => {
    const groups = groupByMonth([
      { ...row('a', '2026-11-01'), at: Date.parse('2026-10-31T23:59:59Z') },
    ]);
    expect(groups[0]!.month).toBe('2026-10');
  });

  it('is empty for no rows', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe('kindCounts', () => {
  it('counts each kind and leaves absent kinds out', () => {
    const counts = kindCounts([
      row('a', '2026-11-01'),
      row('b', '2026-11-02', { kind: 'mail' }),
      row('c', '2026-11-03'),
    ]);
    expect(counts).toEqual({ wallet: 2, mail: 1 });
  });
});
