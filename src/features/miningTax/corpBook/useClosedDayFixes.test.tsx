import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import type { ClosedDay } from '@/engine/corpTaxBook/closedDayFix';
import { MinerRunningAccount } from '@/engine/corpTaxBook/minerRunningAccount';
import type { CorpBookView } from './corpBookView';
import { closedDayPlans, useClosedDayFixes } from './useClosedDayFixes';

const CHAR = 7;
const ORE = 45490;
const DATE = '2026-11-01';

const corp: MiningTaxAssignmentRecord = {
  id: 'c',
  characterId: CHAR,
  date: DATE,
  solarSystemId: 30003838,
  payeeId: 'own',
  oreLines: [{ typeId: ORE, quantity: 100 }],
  taxPct: 10,
  estimatedValue: 10_000,
  taxOwed: 1_000,
  status: 'outstanding',
  updatedAt: 1,
};

const day: ClosedDay = {
  characterId: CHAR,
  date: DATE,
  solarSystemId: 30003838,
  oreLines: [{ typeId: ORE, quantity: 100 }],
  allocations: [
    { id: 'c', payeeId: 'own', taxPct: 10, oreLines: corp.oreLines, status: 'outstanding' },
  ],
  books: [
    {
      corporationId: 98000001,
      minerId: 'm1',
      ownPayeeIds: ['own'],
      share: [{ typeId: ORE, quantity: 60 }],
      taxPct: 10,
      unitPrices: { [ORE]: 100 },
      oreForm: 'compressed',
      moneyApplied: false,
    },
  ],
};

const view = { overlay: { closedDays: [day] } } as unknown as CorpBookView;

const accountPaying = (amount: number) => ({
  account: MinerRunningAccount.build({
    days: [{ date: DATE, tax: 1_000 }],
    payments: [
      {
        id: 'l1',
        minerId: 'own',
        characterId: CHAR,
        amount,
        at: `${DATE}T20:00:00Z`,
        source: 'donation',
      },
    ],
  }),
});

const unpaid = { of: () => undefined, historyOf: () => undefined };

beforeEach(async () => {
  await db.miningTaxAssignments.clear();
  await db.miningTaxRecordChanges.clear();
  await db.settings.clear();
  await db.miningTaxAssignments.put(corp);
});

describe('closedDayPlans', () => {
  it('turns a day with money paid into the changed Assignment into a Conflict', () => {
    const paid = { of: () => accountPaying(500) as never, historyOf: () => undefined };
    expect(closedDayPlans(view, paid).map((p) => p.state)).toEqual(['conflict']);
    expect(closedDayPlans(view, unpaid).map((p) => p.state)).toEqual(['fix']);
  });
});

describe('useClosedDayFixes', () => {
  it('fixes an unpaid closed day once and asks for a reload', async () => {
    const onFixed = vi.fn();
    const { rerender } = renderHook(({ v }) => useClosedDayFixes(v, unpaid, onFixed), {
      initialProps: { v: view },
    });
    await waitFor(() => expect(onFixed).toHaveBeenCalledTimes(1));
    expect((await db.miningTaxAssignments.get('c'))?.oreLines).toEqual([
      { typeId: ORE, quantity: 60 },
    ]);
    rerender({ v: { ...view } as CorpBookView });
    expect(onFixed).toHaveBeenCalledTimes(1);
    expect(await db.miningTaxRecordChanges.count()).toBe(1);
  });

  it('leaves a Conflict day alone', async () => {
    const onFixed = vi.fn();
    const paid = { of: () => accountPaying(500) as never, historyOf: () => undefined };
    renderHook(() => useClosedDayFixes(view, paid, onFixed));
    expect(onFixed).not.toHaveBeenCalled();
    expect((await db.miningTaxAssignments.get('c'))?.oreLines).toEqual(corp.oreLines);
  });
});
