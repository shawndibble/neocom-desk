import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';

vi.mock('@/sync', () => ({ scheduleSync: vi.fn() }));
import { scheduleSync } from '@/sync';
import {
  clearCharacterAccelerator,
  purgeExpiredAccelerators,
  setCharacterAccelerator,
} from './characterAccelerators';

beforeEach(async () => {
  await db.characterAccelerators.clear();
  await db.settings.clear();
  vi.mocked(scheduleSync).mockClear();
});

describe('characterAccelerators', () => {
  it('saves one row per Character, replacing the earlier one, and syncs it', async () => {
    await setCharacterAccelerator(7, 3, 5_000, 100);
    await setCharacterAccelerator(7, 12, 9_000, 200);
    const rows = await db.characterAccelerators.toArray();
    expect(rows).toEqual([
      { id: '7', characterId: 7, bonus: 12, expiresAt: 9_000, updatedAt: 200 },
    ]);
    expect(scheduleSync).toHaveBeenCalledWith(7, { collections: ['characterAccelerators'] });
  });

  it('clears the row and tombstones it so the removal syncs', async () => {
    await setCharacterAccelerator(7, 3, 5_000, 100);
    await clearCharacterAccelerator(7);
    expect(await db.characterAccelerators.count()).toBe(0);
    const tombstones = (await db.settings.toArray()).filter((row) =>
      row.key.includes('characterAcceleratorTombstones')
    );
    expect(tombstones).toHaveLength(1);
  });

  it('clearing a Character with nothing typed in is a no-op', async () => {
    await clearCharacterAccelerator(7);
    expect(scheduleSync).not.toHaveBeenCalled();
  });

  it('purges only the ones that have run out', async () => {
    await setCharacterAccelerator(1, 3, 1_000, 0);
    await setCharacterAccelerator(2, 3, 9_000, 0);
    expect(await purgeExpiredAccelerators(5_000)).toEqual([1]);
    expect((await db.characterAccelerators.toArray()).map((r) => r.characterId)).toEqual([2]);
  });
});
