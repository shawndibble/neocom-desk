import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokens: { characterId: number; scopes: string[] }[] = [];
const cache = new Map<string, unknown>();

vi.mock('@/db', () => ({
  db: {
    tokens: {
      toArray: () => Promise.resolve(tokens),
      get: (id: number) => Promise.resolve(tokens.find((t) => t.characterId === id)),
    },
  },
}));
vi.mock('@/features/character/allCharactersFanOut', () => ({
  fanOutAllCharacters: async ({
    scope,
    load,
  }: {
    scope: string;
    load: (c: { characterId: number; name: string }) => Promise<unknown>;
  }) => {
    const entries: unknown[] = [];
    const skipped: unknown[] = [];
    for (const token of tokens) {
      const character = { characterId: token.characterId, name: `Pilot ${token.characterId}` };
      if (!token.scopes.includes(scope)) {
        skipped.push(character);
        continue;
      }
      try {
        const entry = await load(character);
        (entry === null ? skipped : entries).push(entry ?? character);
      } catch {
        skipped.push(character);
      }
    }
    return { entries, skipped };
  },
}));
vi.mock('@/esi/cache', () => ({
  conditionalFetch: () => ({ fetchLive: () => undefined, conditional: undefined }),
  loadWithCacheStatus: (characterId: number, key: string) => {
    const data = cache.get(`${characterId}:${key}`);
    if (data === 'reauth') return Promise.resolve({ cached: null, needsReauth: true });
    if (data === 'down') return Promise.resolve({ cached: null, needsReauth: false });
    return Promise.resolve({
      cached: data === undefined ? null : { data, fetchedAt: new Date(1_000), fromCache: false },
      needsReauth: false,
    });
  },
  loadStaticEntity: (_prefix: string, planetId: number) =>
    Promise.resolve({ data: { name: `Planet ${planetId}`, system_id: 30000142 } }),
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: () => Promise.resolve(new Map([[98000001, 'Ashfall Holdings']])),
}));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: () => Promise.resolve(new Map([[30000142, { name: 'Jita' }]])),
}));
vi.mock('@/features/route/jumpsFromCurrent', () => ({
  jumpsFromCurrent: () => Promise.resolve(new Map([[30000142, 4]])),
}));

const { DEN_SCOPE, OPERATION_SCOPE, loadCharacterDenRows, loadMercenaryDensWidget } =
  await import('./mercenaryDens');

const denDetail = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  type_id: 1,
  state: 'Running',
  infomorphs: { amount: 184 },
  evolution: {
    development: { amount: 74, level: 'Level3' },
    anarchy: { amount: 62, level: 'Level1' },
  },
  skyhook: { id: 9, planet_id: 40000001, corporation_id: 98000001 },
  ...over,
});

beforeEach(() => {
  tokens.length = 0;
  cache.clear();
});

describe('loadMercenaryDensWidget', () => {
  it('reads each den and ties its operations to it', async () => {
    tokens.push({ characterId: 1, scopes: [DEN_SCOPE, OPERATION_SCOPE] });
    cache.set('1:mercenaryDens', { mercenary_dens: [{ id: 10, planet_id: 40000001 }] });
    cache.set(
      '1:mercenaryDen:10',
      denDetail(10, { state: 'Paused', reinforcement_timer: { end: '2026-10-23T00:00:00Z' } })
    );
    cache.set('1:mercenaryOperations', { operations: [{ id: 'op-a', mercenary_den_id: 10 }] });
    cache.set('1:mercenaryOperation:op-a', {
      id: 'op-a',
      mercenary_den_id: 10,
      state: 'Available',
      dungeon_type_id: 5,
      expires: '2026-10-24T00:00:00Z',
    });

    const data = await loadMercenaryDensWidget(1);
    expect(data.granted).toEqual([1]);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({
      id: 10,
      state: 'reinforced',
      reinforcedUntilMs: Date.parse('2026-10-23T00:00:00Z'),
      anarchyLevel: 1,
      developmentLevel: 3,
      infomorphs: 184,
      planetName: 'Planet 40000001',
      systemId: 30000142,
      operationsRead: true,
      operations: [{ state: 'available', expiresMs: Date.parse('2026-10-24T00:00:00Z') }],
    });
    expect(data.jumps.get(30000142)).toBe(4);
    expect(data.systemNames.get(30000142)).toBe('Jita');
    expect(data.ownerNames.get(98000001)).toBe('Ashfall Holdings');
    expect(data.rows[0]).toMatchObject({
      developmentAmount: 74,
      anarchyAmount: 62,
      skyhookOwnerId: 98000001,
    });
  });

  it('marks operations unread for a Character without the operations scope', async () => {
    tokens.push({ characterId: 1, scopes: [DEN_SCOPE] });
    cache.set('1:mercenaryDens', { mercenary_dens: [{ id: 10, planet_id: 40000001 }] });
    cache.set('1:mercenaryDen:10', denDetail(10));
    const data = await loadMercenaryDensWidget(1);
    expect(data.rows[0]).toMatchObject({ operationsRead: false, operations: [] });
  });

  it('counts a refused Character out of granted without failing the widget', async () => {
    tokens.push({ characterId: 1, scopes: [DEN_SCOPE] }, { characterId: 2, scopes: [] });
    cache.set('1:mercenaryDens', 'reauth');
    const data = await loadMercenaryDensWidget(1);
    expect(data.granted).toEqual([]);
    expect(data.rows).toEqual([]);
  });

  it('keeps a failed Character granted and lists it as failed while another reads fine', async () => {
    tokens.push({ characterId: 1, scopes: [DEN_SCOPE] }, { characterId: 2, scopes: [DEN_SCOPE] });
    cache.set('1:mercenaryDens', 'down');
    cache.set('2:mercenaryDens', { mercenary_dens: [] });
    const data = await loadMercenaryDensWidget(1);
    expect(data.granted).toEqual([1, 2]);
    expect(data.failed).toEqual([1]);
  });

  it('keeps a den whose detail is unreadable as an unknown row', async () => {
    tokens.push({ characterId: 1, scopes: [DEN_SCOPE] });
    cache.set('1:mercenaryDens', { mercenary_dens: [{ id: 10, planet_id: 40000001 }] });
    const data = await loadMercenaryDensWidget(1);
    expect(data.rows[0]).toMatchObject({ state: 'unknown', infomorphs: null, anarchyLevel: null });
  });

  it('reads operations as unknown when any one of them is unreadable', async () => {
    tokens.push({ characterId: 1, scopes: [DEN_SCOPE, OPERATION_SCOPE] });
    cache.set('1:mercenaryDens', { mercenary_dens: [{ id: 10, planet_id: 40000001 }] });
    cache.set('1:mercenaryDen:10', denDetail(10));
    cache.set('1:mercenaryOperations', { operations: [{ id: 'op-a', mercenary_den_id: 10 }] });
    const data = await loadMercenaryDensWidget(1);
    expect(data.rows[0].operationsRead).toBe(false);
  });

  it('throws when every granted read is down, so the widget keeps its last value', async () => {
    tokens.push({ characterId: 1, scopes: [DEN_SCOPE] });
    cache.set('1:mercenaryDens', 'down');
    await expect(loadMercenaryDensWidget(1)).rejects.toThrow();
  });
});

describe('loadCharacterDenRows', () => {
  it('asks to log in again when the token lacks the den scope', async () => {
    tokens.push({ characterId: 1, scopes: [] });
    expect(await loadCharacterDenRows(1)).toEqual({ cached: null, needsReauth: true });
  });

  it("reads one Character's dens as rows, with the read's age", async () => {
    tokens.push({ characterId: 1, scopes: [DEN_SCOPE] });
    cache.set('1:mercenaryDens', { mercenary_dens: [{ id: 10, planet_id: 40000001 }] });
    cache.set('1:mercenaryDen:10', denDetail(10));
    const result = await loadCharacterDenRows(1);
    expect(result.cached?.data).toHaveLength(1);
    expect(result.cached?.data[0]).toMatchObject({ id: 10, planetName: 'Planet 40000001' });
    expect(result.cached?.fetchedAt).toEqual(new Date(1_000));
  });

  it('is unreadable, not empty, when the list read is down', async () => {
    tokens.push({ characterId: 1, scopes: [DEN_SCOPE] });
    cache.set('1:mercenaryDens', 'down');
    expect(await loadCharacterDenRows(1)).toEqual({ cached: null, needsReauth: false });
  });
});
