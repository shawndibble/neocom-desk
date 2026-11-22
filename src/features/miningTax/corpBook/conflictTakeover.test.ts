import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { planTakeover } from './conflictTakeover';

const ZEO = 45490;
const SYL = 45491;
const ME = 1;

const assignment = (over: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord => ({
  id: 'a1',
  characterId: ME,
  date: '2026-11-21',
  solarSystemId: 30003838,
  payeeId: 'star-tail',
  oreLines: [
    { typeId: ZEO, quantity: 51_189 },
    { typeId: SYL, quantity: 41_809 },
  ],
  taxPct: 5,
  estimatedValue: 100,
  taxOwed: 5,
  status: 'outstanding',
  updatedAt: 1,
  ...over,
});

const view = (over: Partial<BookRowView> = {}) =>
  ({
    id: 'v1',
    corporationId: 98000001,
    corpName: 'BUH',
    characterId: ME,
    date: '2026-11-21',
    solarSystemId: 30003838,
    state: 'conflict',
    overlap: { payeeIds: ['star-tail'], ore: [{ typeId: ZEO, quantity: 51_189 }], paid: false },
    ...over,
  }) as BookRowView;

describe('planTakeover', () => {
  it('takes only the book’s ore off the Payee the book names', () => {
    const { steps } = planTakeover(view(), [], [assignment()]);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.after).toEqual([{ typeId: SYL, quantity: 41_809 }]);
  });

  it('plans nothing when no entry of the miner holds that ore', () => {
    expect(planTakeover(view(), [], [assignment({ payeeId: 'someone-else' })]).steps).toEqual([]);
    expect(planTakeover(view({ overlap: undefined }), [], [assignment()]).steps).toEqual([]);
  });

  it('ignores other days, other characters and dismissals', () => {
    const rows = [
      assignment({ id: 'b', date: '2026-11-20' }),
      assignment({ id: 'c', characterId: 2 }),
      assignment({ id: 'd', status: 'dismissed' }),
    ];
    expect(planTakeover(view(), [], rows).steps).toEqual([]);
  });
});
