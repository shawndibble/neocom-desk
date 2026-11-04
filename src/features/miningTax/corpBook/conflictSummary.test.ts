import { describe, expect, it } from 'vitest';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import type { DisplayRow } from '../groupRows';
import { summarizeConflicts } from './conflictSummary';

const row = (
  state: BookRowView['state'],
  billed: number,
  resolvesAt?: string,
  corpName = 'Brass'
) =>
  ({
    key: `${state}-${billed}`,
    corp: { kind: 'row', corpName, view: { state, billed, resolvesAt } as BookRowView },
  }) as unknown as DisplayRow;

describe('summarizeConflicts', () => {
  it('is null with no Conflict in view', () => {
    expect(summarizeConflicts([row('billed', 500)])).toBeNull();
  });

  it('sums what every Conflict would bill and leads with the first to resolve', () => {
    const late = row('conflict', 300, '2026-11-20T00:30:00Z', 'Ashfall');
    const soon = row('conflict', 200, '2026-11-12T11:00:00Z', 'Brass');
    const out = summarizeConflicts([late, row('billed', 999), soon]);
    expect(out).toMatchObject({
      count: 2,
      amount: 500,
      firstDate: '2026-11-12',
      firstCorpName: 'Brass',
    });
    expect(out?.first).toBe(soon);
  });
});
