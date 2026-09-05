import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import type { StationPinRecord } from '@/db';
import { stationPinTombstonesKey } from './localBookkeeping';
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

async function seedTombstone(
  characterId: number,
  locationId: number,
  deletedAt: number
): Promise<void> {
  await db.settings.put({
    key: stationPinTombstonesKey(characterId),
    value: [{ id: `${characterId}:${locationId}`, deletedAt }],
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all([
    db.characters.clear(),
    db.stationPins.clear(),
    db.planetRichness.clear(),
    db.settings.clear(),
  ]);
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

  it('skips a row another Character has already recorded a deletion for', async () => {
    // The resurrection this guards. `cloneOnto` re-keys the row to an id no
    // tombstone anywhere targets, so `merge.ts` would see `l && !r` and push it
    // as a brand-new remote doc nothing can out-rank — and `pinStateForStation`
    // reports 'account' if ANY Character holds an account row. Copying a stale
    // row therefore brings a cleared pin back permanently, not until next sync.
    await seedCharacter(1);
    await seedPin(1, 60_003_760, 'account', 100);
    await seedCharacter(3);
    await seedTombstone(3, 60_003_760, 500);
    await seedCharacter(2);

    expect(await backfillAccountWideData(2)).toBe(false);
    expect(await db.stationPins.get('2:60003760')).toBeUndefined();
  });

  it('still copies a row made after the deletion it is compared against', async () => {
    // A re-pin is not a stale row. Only a candidate OLDER than the recorded
    // deletion is refused, or the guard would block legitimate state.
    await seedCharacter(1);
    await seedPin(1, 60_003_760, 'account', 900);
    await seedCharacter(3);
    await seedTombstone(3, 60_003_760, 500);
    await seedCharacter(2);

    expect(await backfillAccountWideData(2)).toBe(true);
    expect((await db.stationPins.get('2:60003760'))?.updatedAt).toBe(900);
  });

  it('leaves nothing behind when the backfilled Character is then removed', async () => {
    // #432's third named test case. `removeCharacter` deletes station pins by
    // characterId, and backfilled rows carry the new Character's own id — so
    // they are its rows in every sense, including on the way out. The other
    // Characters' copies must survive: an account-wide pin is still the
    // account's after one pilot leaves.
    const { removeCharacter } = await import('@/features/character/removeCharacter');
    await seedCharacter(1);
    await seedPin(1, 60_003_760, 'account');
    await seedCharacter(2);
    await backfillAccountWideData(2);
    expect(await db.stationPins.get('2:60003760')).toBeDefined();

    await removeCharacter(2, false);

    expect(await db.stationPins.get('2:60003760')).toBeUndefined();
    expect(await db.stationPins.get('1:60003760')).toBeDefined();
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

describe('planet richness (#425) — the second collection', () => {
  async function seedRichness(
    characterId: number,
    planetId: number,
    order: number[],
    updatedAt = 100
  ) {
    await db.planetRichness.put({
      id: `${characterId}:${planetId}`,
      characterId,
      planetId,
      order,
      updatedAt,
    });
  }

  it('copies a ranking onto a Character added later', async () => {
    await seedCharacter(1);
    await seedRichness(1, 40_000_001, [2073, 2268]);
    await seedCharacter(2);

    expect(await backfillAccountWideData(2)).toBe(true);
    expect(await db.planetRichness.get('2:40000001')).toMatchObject({
      characterId: 2,
      planetId: 40_000_001,
      order: [2073, 2268],
      updatedAt: 100,
    });
  });

  it('gives the copy its own array, so reordering one does not reorder the other', async () => {
    await seedCharacter(1);
    await seedRichness(1, 40_000_001, [2073, 2268]);
    await seedCharacter(2);
    await backfillAccountWideData(2);

    const copied = await db.planetRichness.get('2:40000001');
    copied!.order.reverse();

    expect((await db.planetRichness.get('1:40000001'))?.order).toEqual([2073, 2268]);
  });

  it('backfills both collections in one pass', async () => {
    await seedCharacter(1);
    await seedPin(1, 60_003_760, 'account');
    await seedRichness(1, 40_000_001, [2073]);
    await seedCharacter(2);

    expect(await backfillAccountWideData(2)).toBe(true);
    expect(await db.stationPins.get('2:60003760')).toBeDefined();
    expect(await db.planetRichness.get('2:40000001')).toBeDefined();
  });
});
