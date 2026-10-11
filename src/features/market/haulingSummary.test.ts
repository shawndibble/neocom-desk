import { describe, expect, it } from 'vitest';
import { summarizeHaulingRows } from './haulingSummary';

const row = (name: string, from: string, to: string, profitPerUnit: number, units: number) => ({
  name,
  profitPerUnit,
  suggestedUnits: units,
  fromHub: { id: from },
  toHub: { id: to },
});

describe('summarizeHaulingRows', () => {
  it('keeps the best haul on each lane, best lane first', () => {
    const summary = summarizeHaulingRows(
      [
        row('A', 'jita', 'amarr', 10, 100),
        row('B', 'jita', 'amarr', 50, 100),
        row('C', 'jita', 'dodixie', 20, 100),
      ],
      123
    );
    expect(summary).toEqual({
      fetchedAt: 123,
      lanes: [
        { fromHub: 'jita', toHub: 'amarr', item: 'B', profit: 5000 },
        { fromHub: 'jita', toHub: 'dodixie', item: 'C', profit: 2000 },
      ],
    });
  });

  it('keeps at most three lanes and skips rows that earn nothing', () => {
    const rows = ['amarr', 'dodixie', 'rens', 'hek'].map((to, i) =>
      row(`I${i}`, 'jita', to, i + 1, 10)
    );
    const summary = summarizeHaulingRows([...rows, row('Loss', 'amarr', 'jita', -5, 10)], 1);
    expect(summary?.lanes.map((l) => l.toHub)).toEqual(['hek', 'rens', 'dodixie']);
  });

  it('is null when nothing earns', () => {
    expect(summarizeHaulingRows([], 1)).toBeNull();
    expect(summarizeHaulingRows([row('A', 'jita', 'amarr', 0, 10)], 1)).toBeNull();
  });
});
