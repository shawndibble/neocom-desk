import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { loadPriceSnapshots, saveTodayPriceSnapshot } from './priceSnapshots';

beforeEach(async () => {
  await db.jitaPriceSnapshots.clear();
});

describe('saveTodayPriceSnapshot', () => {
  it("merges into today's day: re-priced types overwrite, others are kept", async () => {
    await saveTodayPriceSnapshot('2026-09-22', { 1: { buy: 1, sell: 2 }, 2: { buy: 3, sell: 4 } });
    await saveTodayPriceSnapshot('2026-09-22', { 1: { buy: 5, sell: 6 } });

    const saved = await loadPriceSnapshots();

    expect(saved.get('2026-09-22')).toEqual({ 1: { buy: 5, sell: 6 }, 2: { buy: 3, sell: 4 } });
  });

  it('drops saved days older than 90 days, today counted as day one', async () => {
    await db.jitaPriceSnapshots.bulkPut([
      { date: '2026-06-24', prices: { 1: { buy: 1, sell: 1 } } },
      { date: '2026-06-25', prices: { 1: { buy: 1, sell: 1 } } },
    ]);

    await saveTodayPriceSnapshot('2026-09-22', { 1: { buy: 2, sell: 2 } });

    expect([...(await loadPriceSnapshots()).keys()].sort()).toEqual(['2026-06-25', '2026-09-22']);
  });
});
