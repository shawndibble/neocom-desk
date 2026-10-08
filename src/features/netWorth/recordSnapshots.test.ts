import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import {
  recordAllNetWorthSnapshots,
  recordNetWorthSnapshot,
  type SnapshotSources,
} from './recordSnapshots';

vi.mock('@/sync', () => ({ scheduleSync: vi.fn() }));

const DAY1 = Date.UTC(2026, 9, 7, 8);
const DAY1_LATER = Date.UTC(2026, 9, 7, 22);
const DAY2 = Date.UTC(2026, 9, 8, 1);

function sourcesWith(wallet: number | null = 100) {
  const fetch = vi.fn(async () => ({
    hubId: 'jita',
    wallet,
    assets: [{ item_id: 1, type_id: 34, quantity: 2 }],
    orders: [{ is_buy_order: true, escrow: 7 }],
    priceByTypeId: new Map([[34, 5]]),
    plexPrice: null,
  }));
  return { sources: { fetch } satisfies SnapshotSources, fetch };
}

beforeEach(async () => {
  await Promise.all([db.netWorthSnapshots.clear(), db.characters.clear()]);
});

describe('recordNetWorthSnapshot', () => {
  it('writes one row, then leaves the day alone however often it runs', async () => {
    const { sources, fetch } = sourcesWith();
    expect(await recordNetWorthSnapshot(1, sources, DAY1)).toBe('written');
    expect(await recordNetWorthSnapshot(1, sources, DAY1_LATER)).toBe('already-recorded');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await db.netWorthSnapshots.toArray()).toEqual([
      {
        id: '1:2026-10-07',
        characterId: 1,
        day: '2026-10-07',
        wallet: 100,
        assetValue: 10,
        plexValue: 0,
        escrow: 7,
        sellStock: 0,
        hubId: 'jita',
        updatedAt: DAY1,
      },
    ]);
  });

  it('writes a new row the next UTC day', async () => {
    const { sources } = sourcesWith();
    await recordNetWorthSnapshot(1, sources, DAY1);
    expect(await recordNetWorthSnapshot(1, sources, DAY2)).toBe('written');
    expect(await db.netWorthSnapshots.count()).toBe(2);
  });

  it('writes nothing when a permission is missing', async () => {
    const missing = { fetch: async () => null };
    expect(await recordNetWorthSnapshot(1, missing, DAY1)).toBe('skipped');
    expect(await recordNetWorthSnapshot(1, sourcesWith(null).sources, DAY1)).toBe('skipped');
    expect(await db.netWorthSnapshots.count()).toBe(0);
  });

  it('does not throw when a source fails', async () => {
    const failing = {
      fetch: async () => {
        throw new Error('offline');
      },
    };
    expect(await recordNetWorthSnapshot(1, failing, DAY1)).toBe('skipped');
  });

  it('two overlapping runs for one Character write once', async () => {
    const { sources, fetch } = sourcesWith();
    await Promise.all([
      recordNetWorthSnapshot(1, sources, DAY1),
      recordNetWorthSnapshot(1, sources, DAY1),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('recordAllNetWorthSnapshots', () => {
  it('records every stored Character', async () => {
    await db.characters.bulkPut([
      { characterId: 1, name: 'A' },
      { characterId: 2, name: 'B' },
    ] as never);
    await recordAllNetWorthSnapshots(sourcesWith().sources, DAY1);
    expect((await db.netWorthSnapshots.toArray()).map((r) => r.characterId).sort()).toEqual([1, 2]);
  });
});
