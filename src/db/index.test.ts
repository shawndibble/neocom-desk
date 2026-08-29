import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './index';

beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.skillPlans.clear();
  await db.esiCache.clear();
  await db.buildPlans.clear();
});

describe('neocom database', () => {
  it('is named neocom', () => {
    expect(db.name).toBe('neocom');
  });

  it('adds and gets a character by characterId', async () => {
    await db.characters.add({
      characterId: 2112625428,
      name: 'CCP Alpha',
      ownerHash: 'hash-1',
      addedAt: 1000,
    });
    const c = await db.characters.get(2112625428);
    expect(c?.name).toBe('CCP Alpha');
    expect(c?.ownerHash).toBe('hash-1');
    expect(c?.addedAt).toBe(1000);
  });

  it('adds, gets, and updates a token record', async () => {
    await db.tokens.put({
      characterId: 2112625428,
      accessToken: 'a1',
      refreshToken: 'r1',
      expiresAt: 5000,
      scopes: ['esi-skills.read_skills.v1'],
    });
    expect((await db.tokens.get(2112625428))?.refreshToken).toBe('r1');

    await db.tokens.put({
      characterId: 2112625428,
      accessToken: 'a2',
      refreshToken: 'r2',
      expiresAt: 9000,
      scopes: ['esi-skills.read_skills.v1'],
    });
    const t = await db.tokens.get(2112625428);
    expect(t?.accessToken).toBe('a2');
    expect(t?.refreshToken).toBe('r2');
    expect(t?.expiresAt).toBe(9000);
    expect(await db.tokens.count()).toBe(1);
  });

  it('stores settings by key', async () => {
    await db.settings.put({ key: 'theme', value: 'dark' });
    expect((await db.settings.get('theme'))?.value).toBe('dark');
  });

  it('adds, gets, and indexes skill plans by characterId', async () => {
    await db.skillPlans.add({
      id: 'plan-1',
      characterId: 2112625428,
      name: 'PvP fit',
      entries: [{ skillTypeID: 3300, targetLevel: 5 }],
      remapCount: 1,
      updatedAt: 1000,
    });
    await db.skillPlans.add({
      id: 'plan-2',
      characterId: 999,
      name: 'Other character',
      entries: [],
      remapCount: 0,
      updatedAt: 1000,
    });

    const plan = await db.skillPlans.get('plan-1');
    expect(plan?.name).toBe('PvP fit');
    expect(plan?.entries).toEqual([{ skillTypeID: 3300, targetLevel: 5 }]);

    const forCharacter = await db.skillPlans.where('characterId').equals(2112625428).toArray();
    expect(forCharacter.map((p) => p.id)).toEqual(['plan-1']);
  });

  it('adds, gets, and indexes build plans by characterId', async () => {
    await db.buildPlans.add({
      id: 'bp-1',
      characterId: 2112625428,
      name: 'Rifter run',
      blueprintTypeID: 638,
      runs: 10,
      me: 10,
      te: 20,
      facility: 'npcStation',
      rigLevel: 'none',
      security: 'highsec',
      hubId: 'jita',
      updatedAt: 1000,
    });
    await db.buildPlans.add({
      id: 'bp-2',
      characterId: 999,
      name: 'Other character',
      blueprintTypeID: 640,
      runs: 1,
      me: 0,
      te: 0,
      facility: 'raitaru',
      rigLevel: 't2',
      security: 'nullsec',
      hubId: 'amarr',
      facilityTaxPct: 1.5,
      updatedAt: 1000,
    });

    const plan = await db.buildPlans.get('bp-1');
    expect(plan?.name).toBe('Rifter run');
    expect(plan?.blueprintTypeID).toBe(638);
    expect(plan?.facilityTaxPct).toBeUndefined();

    const forCharacter = await db.buildPlans.where('characterId').equals(2112625428).toArray();
    expect(forCharacter.map((p) => p.id)).toEqual(['bp-1']);

    const structurePlan = await db.buildPlans.get('bp-2');
    expect(structurePlan?.facilityTaxPct).toBe(1.5);
  });

  it('caches ESI values per character+key, keyed compositely', async () => {
    await db.esiCache.put({ characterId: 91, key: 'skills', value: { total_sp: 1 }, fetchedAt: 5 });
    await db.esiCache.put({ characterId: 92, key: 'skills', value: { total_sp: 2 }, fetchedAt: 6 });

    expect((await db.esiCache.get([91, 'skills']))?.value).toEqual({ total_sp: 1 });
    expect((await db.esiCache.get([92, 'skills']))?.value).toEqual({ total_sp: 2 });

    await db.esiCache.put({ characterId: 91, key: 'skills', value: { total_sp: 3 }, fetchedAt: 7 });
    expect(await db.esiCache.count()).toBe(2);
    expect((await db.esiCache.get([91, 'skills']))?.value).toEqual({ total_sp: 3 });
  });
});
