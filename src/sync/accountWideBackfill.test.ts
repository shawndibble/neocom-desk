import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import type { StationPinRecord } from '@/db';
import { backfillAccountWideData } from './accountWideBackfill';

async function seedCharacter(characterId: number): Promise<void> {
  await db.characters.put({
    characterId,
    name: `Pilot ${characterId}`,
    ownerHash: `hash-${characterId}`,
    addedAt: 1,
  });
}

async function seedPin(
  characterId: number,
  locationId: number,
  scope: StationPinRecord['scope'],
  updatedAt = 100
): Promise<void> {
  await db.stationPins.put({
    id: `${characterId}:${locationId}`,
    characterId,
    locationId,
    scope,
    updatedAt,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all([db.characters.clear(), db.stationPins.clear()]);
});

describe('backfillAccountWideData', () => {
  it('copies an account-wide pin onto a Character added later', async () => {
    await seedCharacter(1);
    await seedPin(1, 60_003_760, 'account');
    await seedCharacter(2);

    await backfillAccountWideData(2);

    const copied = await db.stationPins.get('2:60003760');
    expect(copied).toMatchObject({
      characterId: 2,
      locationId: 60_003_760,
      scope: 'account',
    });
  });

  it('leaves a character-scoped pin alone — that is one pilot’s own preference', async () => {
    await seedCharacter(1);
    await seedPin(1, 60_003_760, 'character');
    await seedCharacter(2);

    await backfillAccountWideData(2);

    expect(await db.stationPins.get('2:60003760')).toBeUndefined();
  });

  it("carries the source row's updatedAt rather than stamping now", async () => {
    // The whole point: `merge.ts` is last-write-wins, and a tombstone this
    // Character already has on another device carries its own `deletedAt`. A
    // row stamped `Date.now()` here would out-rank that tombstone and
    // resurrect a pin the user deleted elsewhere. Copying the source stamp
    // keeps the comparison honest.
    await seedCharacter(1);
    await seedPin(1, 60_003_760, 'account', 12_345);
    await seedCharacter(2);

    await backfillAccountWideData(2);

    expect((await db.stationPins.get('2:60003760'))?.updatedAt).toBe(12_345);
  });

  it('reports that it wrote, so the caller knows to schedule a sync', async () => {
    // Scheduling is the caller's, per `setSyncedSetting`'s convention — this
    // module stays free of any import that would cycle through `./index` or
    // drag Firebase in via `./planSync`.
    await seedCharacter(1);
    await seedPin(1, 60_003_760, 'account');
    await seedCharacter(2);

    expect(await backfillAccountWideData(2)).toBe(true);
  });

  it('takes the union across every existing Character, not one source', async () => {
    // Steady state has every Character holding the same account rows, since
    // `setAccountStationPin` writes to all and `clearStationPin` deletes from
    // all. A partially-synced device can break that, and the union is the
    // reading that loses nothing.
    await seedCharacter(1);
    await seedPin(1, 60_003_760, 'account');
    await seedCharacter(3);
    await seedPin(3, 60_008_494, 'account');
    await seedCharacter(2);

    await backfillAccountWideData(2);

    const pins = await db.stationPins.where('characterId').equals(2).toArray();
    expect(pins.map((pin) => pin.locationId).sort()).toEqual([60_003_760, 60_008_494]);
  });

  it('never reads the new Character as its own source', async () => {
    await seedCharacter(2);
    await seedPin(2, 60_003_760, 'account');

    await backfillAccountWideData(2);

    const pins = await db.stationPins.where('characterId').equals(2).toArray();
    expect(pins).toHaveLength(1);
  });

  it('is a no-op for the very first Character, with nothing to copy from', async () => {
    await seedCharacter(1);

    expect(await backfillAccountWideData(1)).toBe(false);
    expect(await db.stationPins.count()).toBe(0);
  });

  it('reports that it wrote nothing when no account-wide rows exist', async () => {
    await seedCharacter(1);
    await seedPin(1, 60_003_760, 'character');
    await seedCharacter(2);

    expect(await backfillAccountWideData(2)).toBe(false);
    expect(await db.stationPins.where('characterId').equals(2).count()).toBe(0);
  });

  it('does not clobber a row the new Character already has', async () => {
    // Sync may have pulled this Character's own rows down before the backfill
    // runs. Its own copy is the authoritative one — it carries whatever
    // `updatedAt` the merge settled on — so the backfill must not overwrite it.
    await seedCharacter(1);
    await seedPin(1, 60_003_760, 'account', 100);
    await seedCharacter(2);
    await seedPin(2, 60_003_760, 'account', 999);

    expect(await backfillAccountWideData(2)).toBe(false);
    expect((await db.stationPins.get('2:60003760'))?.updatedAt).toBe(999);
  });

  it('deduplicates a location several Characters hold, keeping the newest stamp', async () => {
    await seedCharacter(1);
    await seedPin(1, 60_003_760, 'account', 100);
    await seedCharacter(3);
    await seedPin(3, 60_003_760, 'account', 500);
    await seedCharacter(2);

    await backfillAccountWideData(2);

    expect((await db.stationPins.get('2:60003760'))?.updatedAt).toBe(500);
  });
});
