import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { removeCharacter } from './removeCharacter';

const syncMock = vi.hoisted(() => ({
  clearCharacterSyncBookkeeping: vi.fn(async () => {}),
  purgeCharacterRemoteDataOrDefer: vi.fn(async () => true),
}));
vi.mock('@/sync', () => syncMock);

async function seedCharacter(characterId: number): Promise<void> {
  await db.characters.put({
    characterId,
    name: `Pilot ${characterId}`,
    ownerHash: `hash-${characterId}`,
    addedAt: 1,
  });
  await db.tokens.put({
    characterId,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 100_000,
    scopes: [],
  });
  await db.skillPlans.add({
    id: `plan-${characterId}`,
    characterId,
    name: 'Plan',
    entries: [],
    remapCount: 1,
    updatedAt: 1,
  });
  await db.buildPlans.add({
    id: `build-${characterId}`,
    characterId,
    name: 'Build',
    blueprintTypeID: 1,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 1,
  });
  await db.quickbars.add({ id: String(characterId), characterId, items: [], updatedAt: 1 });
  await db.stationPins.add({
    id: `${characterId}:60003760`,
    characterId,
    locationId: 60003760,
    scope: 'character',
    updatedAt: 1,
  });
  await db.esiCache.put({ characterId, key: 'wallet', value: 100, fetchedAt: 1 });
}

beforeEach(async () => {
  vi.clearAllMocks();
  syncMock.clearCharacterSyncBookkeeping.mockImplementation(async () => {});
  syncMock.purgeCharacterRemoteDataOrDefer.mockImplementation(async () => true);
  await Promise.all([
    db.characters.clear(),
    db.tokens.clear(),
    db.skillPlans.clear(),
    db.buildPlans.clear(),
    db.quickbars.clear(),
    db.stationPins.clear(),
    db.esiCache.clear(),
    db.settings.clear(),
  ]);
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
});

describe('removeCharacter', () => {
  it('deletes every local row for the character', async () => {
    await seedCharacter(1);

    await removeCharacter(1, true);

    expect(await db.characters.get(1)).toBeUndefined();
    expect(await db.tokens.get(1)).toBeUndefined();
    expect(await db.skillPlans.where('characterId').equals(1).count()).toBe(0);
    expect(await db.buildPlans.where('characterId').equals(1).count()).toBe(0);
    expect(await db.quickbars.where('characterId').equals(1).count()).toBe(0);
    expect(await db.stationPins.where('characterId').equals(1).count()).toBe(0);
    expect(await db.esiCache.where('[characterId+key]').equals([1, 'wallet']).count()).toBe(0);
  });

  it('does not touch another character’s data', async () => {
    await seedCharacter(1);
    await seedCharacter(2);

    await removeCharacter(1, true);

    expect(await db.characters.get(2)).toBeDefined();
    expect(await db.skillPlans.where('characterId').equals(2).count()).toBe(1);
  });

  it('attempts the remote purge and clears sync bookkeeping when configured', async () => {
    await seedCharacter(1);

    const result = await removeCharacter(1, true);

    expect(syncMock.purgeCharacterRemoteDataOrDefer).toHaveBeenCalledWith(1);
    expect(syncMock.clearCharacterSyncBookkeeping).toHaveBeenCalledWith(1);
    expect(result).toEqual({ remotePurged: true });
  });

  it('reports a deferred purge without failing local removal', async () => {
    await seedCharacter(1);
    syncMock.purgeCharacterRemoteDataOrDefer.mockResolvedValueOnce(false);

    const result = await removeCharacter(1, true);

    expect(result).toEqual({ remotePurged: false });
    expect(await db.characters.get(1)).toBeUndefined();
  });

  it('skips the remote purge attempt entirely when sync is not configured', async () => {
    await seedCharacter(1);

    const result = await removeCharacter(1, false);

    expect(syncMock.purgeCharacterRemoteDataOrDefer).not.toHaveBeenCalled();
    expect(result).toEqual({ remotePurged: true });
  });

  it('reassigns the active character when the removed one was active', async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    await useActiveCharacter.getState().setActiveCharacter(1);

    await removeCharacter(1, true);

    expect(useActiveCharacter.getState().activeCharacterId).toBe(2);
  });

  it('clears the active selection when the removed character was the last one', async () => {
    await seedCharacter(1);
    await useActiveCharacter.getState().setActiveCharacter(1);

    await removeCharacter(1, true);

    expect(useActiveCharacter.getState().activeCharacterId).toBeNull();
  });

  it('leaves the active-character selection untouched when removing a different character', async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    await useActiveCharacter.getState().setActiveCharacter(2);

    await removeCharacter(1, true);

    expect(useActiveCharacter.getState().activeCharacterId).toBe(2);
  });
});
