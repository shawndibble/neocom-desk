import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { MinerRunningAccount } from '@/engine/corpTaxBook/minerRunningAccount';
import type { TaxPayment } from '@/engine/corpTaxBook/payments';
import type { CorpBookView } from './corpBookView';
import { useToleranceRecordChanges } from './useToleranceRecordChanges';

const payment = (amount: number): TaxPayment => ({
  id: 'p1',
  minerId: 'm1',
  characterId: 7,
  amount,
  at: '2026-11-02T10:00:00Z',
  source: 'donation',
});

function viewPaying(amount: number): CorpBookView {
  const payments = [payment(amount)];
  const account = MinerRunningAccount.build({
    days: [{ date: '2026-11-01', tax: 1_000_000 }],
    payments,
  });
  return {
    books: [
      {
        loaded: {
          corporationId: 98000001,
          characterIds: [7],
          miners: [{ id: 'm1', characterIds: [7], mainCharacterId: 7 }],
        },
        summary: { miners: [{ minerId: 'm1', account, payments }] },
      },
    ],
  } as unknown as CorpBookView;
}

beforeEach(async () => {
  await db.miningTaxRecordChanges.clear();
  await db.settings.clear();
});

describe('useToleranceRecordChanges', () => {
  it('saves one close-out for a day paid within tolerance, and no second one when the books run again', async () => {
    const { result, rerender } = renderHook(
      ({ view, key }) => useToleranceRecordChanges(view, key),
      { initialProps: { view: viewPaying(996_000), key: 'a' } }
    );
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toMatchObject({
      reason: 'tolerance',
      date: '2026-11-01',
      closeOut: { billed: 1_000_000, paid: 996_000, writtenOff: 4_000 },
    });
    rerender({ view: viewPaying(996_000), key: 'b' });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(await db.miningTaxRecordChanges.count()).toBe(1);
    expect((await db.miningTaxRecordChanges.toArray())[0]?.characterId).toBe(7);
  });

  it('saves nothing for a day paid outside tolerance', async () => {
    const { result, rerender } = renderHook(({ view }) => useToleranceRecordChanges(view, 'a'), {
      initialProps: { view: viewPaying(990_000) },
    });
    rerender({ view: viewPaying(996_000) });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(await db.miningTaxRecordChanges.toArray()).toEqual([
      expect.objectContaining({ closeOut: expect.objectContaining({ paid: 996_000 }) }),
    ]);
  });
});
