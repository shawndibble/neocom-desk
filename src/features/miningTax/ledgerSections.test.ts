import { describe, expect, it } from 'vitest';
import type { DisplayRow } from './groupRows';
import { splitLedger } from './ledgerSections';

function dr(key: string, status: DisplayRow['status'], date: string): DisplayRow {
  return {
    key,
    status,
    assignment: null,
    row: {
      characterId: 1,
      characterName: 'Mero Otichoda',
      entry: { characterId: 1, date, solarSystemId: 1, oreLines: [] },
      assignments: [],
      unassignedOreLines: [],
    },
  };
}

describe('splitLedger', () => {
  it('puts everything still needing the pilot in Open, the rest in History', () => {
    const { open, history } = splitLedger(
      [
        dr('a', 'paid', '2026-10-03'),
        dr('b', 'outstanding', '2026-09-30'),
        dr('c', 'unassigned', '2026-10-04'),
        dr('d', 'needs-review', '2026-09-01'),
        dr('e', 'dismissed', '2026-09-02'),
      ],
      (row) => row.row.entry.date
    );
    expect(open.map((r) => r.key).sort()).toEqual(['b', 'c', 'd']);
    expect(history.flatMap((m) => m.rows.map((r) => r.key))).toEqual(['a', 'e']);
  });

  it('groups History by EVE month, newest month first, rows newest first', () => {
    const { history } = splitLedger(
      [
        dr('aug', 'paid', '2026-08-29'),
        dr('sep1', 'paid', '2026-09-02'),
        dr('oct', 'paid', '2026-10-03'),
        dr('sep2', 'paid', '2026-09-29'),
      ],
      (row) => row.row.entry.date
    );
    expect(history.map((m) => m.month)).toEqual(['2026-10', '2026-09', '2026-08']);
    expect(history[1].rows.map((r) => r.key)).toEqual(['sep2', 'sep1']);
  });

  it('files a combined entry under the month its last day falls in', () => {
    const { history } = splitLedger([dr('x', 'paid', '2026-09-30')], () => '2026-10-01');
    expect(history[0].month).toBe('2026-10');
  });
});
