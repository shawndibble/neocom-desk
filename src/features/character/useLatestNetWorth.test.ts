import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import type { NetWorthSnapshotRecord } from '@/db/records';
import { latestNetWorthByCharacter } from '@/engine/netWorth/latest';
import { loadNewestSnapshots } from './useLatestNetWorth';

const snap = (characterId: number, day: string, wallet = 1): NetWorthSnapshotRecord =>
  ({
    id: `${characterId}:${day}`,
    characterId,
    day,
    wallet,
    assetValue: 0,
    escrow: 0,
  }) as NetWorthSnapshotRecord;

beforeEach(async () => {
  await db.netWorthSnapshots.clear();
});

describe('loadNewestSnapshots', () => {
  it('is empty on an empty table', async () => {
    expect(await loadNewestSnapshots()).toEqual([]);
  });

  it('gives the same per-Character latest as reading the whole table', async () => {
    const rows = [
      snap(2, '2026-01-05', 5),
      snap(1, '2026-03-01', 3),
      snap(1, '2026-01-01', 1),
      snap(1, '2026-02-01', 2),
      snap(3, '2025-12-31', 9),
      snap(2, '2026-01-04', 4),
    ];
    await db.netWorthSnapshots.bulkPut(rows);
    const targeted = await loadNewestSnapshots();
    expect(targeted).toHaveLength(3);
    expect(latestNetWorthByCharacter(targeted)).toEqual(latestNetWorthByCharacter(rows));
  });
});
