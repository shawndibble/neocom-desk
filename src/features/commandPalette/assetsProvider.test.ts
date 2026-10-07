import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@/db';
import { writeCached } from '@/esi/cache';
import type { CharacterAsset } from '@/esi/endpoints';
import {
  assetsHref,
  buildPaletteAssets,
  createAssetsProvider,
  loadPaletteAssets,
  loadPaletteAssetsScope,
  type PaletteAsset,
} from './assetsProvider';
import type { PaletteProvider, PaletteResult } from './types';

vi.mock('@/features/character/typeNames', () => ({
  readCachedTypeNames: vi.fn(
    async (ids: readonly number[]) =>
      new Map(
        ids
          .map((id) => [id, TYPE_NAMES[id]] as const)
          .filter((entry): entry is readonly [number, string] => entry[1] !== undefined)
      )
  ),
}));

const TYPE_NAMES: Record<number, string> = { 34: 'Tritanium', 587: 'Rifter' };
const ASSETS_SCOPE = 'esi-assets.read_assets.v1';
const signal = new AbortController().signal;

function asset(item_id: number, type_id: number, quantity: number): CharacterAsset {
  return { item_id, type_id, quantity, location_id: 60003760 } as CharacterAsset;
}

function answer(provider: PaletteProvider, query: string): readonly PaletteResult[] {
  const result = provider.search(query, signal);
  if (!Array.isArray(result)) throw new Error('assets answered asynchronously');
  return result as readonly PaletteResult[];
}

describe('buildPaletteAssets', () => {
  it('merges every Character’s stacks into one row per type, summing quantities', () => {
    const rows = buildPaletteAssets(
      [
        { characterId: 1, name: 'Main', assets: [asset(1, 34, 100), asset(2, 34, 50)] },
        { characterId: 2, name: 'Alt', assets: [asset(3, 34, 7), asset(4, 587, 1)] },
      ],
      new Map([
        [34, 'Tritanium'],
        [587, 'Rifter'],
      ])
    );
    expect(rows).toEqual<PaletteAsset[]>([
      {
        typeId: 34,
        name: 'Tritanium',
        quantity: 157,
        holders: [
          { characterId: 1, characterName: 'Main', quantity: 150 },
          { characterId: 2, characterName: 'Alt', quantity: 7 },
        ],
      },
      {
        typeId: 587,
        name: 'Rifter',
        quantity: 1,
        holders: [{ characterId: 2, characterName: 'Alt', quantity: 1 }],
      },
    ]);
  });

  it('drops types whose name is not cached', () => {
    const rows = buildPaletteAssets(
      [{ characterId: 1, name: 'Main', assets: [asset(1, 99999, 1)] }],
      new Map()
    );
    expect(rows).toEqual([]);
  });
});

describe('assetsHref', () => {
  it('searches the active Character’s assets when it is the only holder', () => {
    expect(assetsHref('Rifter', [1], 1)).toBe('/assets?q=Rifter');
  });

  it('widens to every Character when another one holds some', () => {
    expect(assetsHref("Pilot's Rifter", [1, 2], 1)).toBe('/assets?q=Pilot%27s+Rifter&chars=all');
    expect(assetsHref('Rifter', [2], 1)).toBe('/assets?q=Rifter&chars=all');
    expect(assetsHref('Rifter', [2], null)).toBe('/assets?q=Rifter&chars=all');
  });
});

describe('createAssetsProvider', () => {
  const ASSETS: PaletteAsset[] = [
    {
      typeId: 34,
      name: 'Tritanium',
      quantity: 157,
      holders: [
        { characterId: 1, characterName: 'Main', quantity: 150 },
        { characterId: 2, characterName: 'Alt', quantity: 7 },
      ],
    },
    {
      typeId: 587,
      name: 'Rifter',
      quantity: 1,
      holders: [{ characterId: 1, characterName: 'Main', quantity: 1 }],
    },
  ];

  function provider(overrides: Partial<Parameters<typeof createAssetsProvider>[0]> = {}) {
    return createAssetsProvider({
      assets: ASSETS,
      activeCharacterId: 1,
      navigate: vi.fn(),
      describe: (a) => a.holders.map((h) => `${h.characterName} ${h.quantity}`).join(', '),
      quantityHint: (quantity) => `×${quantity}`,
      ...overrides,
    });
  }

  it('finds an owned item by part of its name, with its holders and total', () => {
    const [result, ...rest] = answer(provider(), 'trit');
    expect(rest).toEqual([]);
    expect(result.label).toBe('Tritanium');
    expect(result.sublabel).toBe('Main 150, Alt 7');
    expect(result.hint).toBe('×157');
  });

  it('opens the Assets page searching for it', () => {
    const navigate = vi.fn();
    answer(provider({ navigate }), 'trit')[0].run();
    expect(navigate).toHaveBeenCalledWith('/assets?q=Tritanium&chars=all');
    answer(provider({ navigate }), 'rift')[0].run();
    expect(navigate).toHaveBeenCalledWith('/assets?q=Rifter');
  });

  it('sits just before Market Items, searched from two characters', () => {
    const p = provider();
    expect(p.order).toBe(3);
    expect(p.minQueryLength).toBe(2);
  });

  it('reads out the Characters it covers, naming who is missing', () => {
    expect(provider().scope).toBeUndefined();
    expect(provider({ scope: { total: 3, missing: ['Alt'] } }).scope).toEqual({
      scope: 'all',
      total: 3,
      missing: ['Alt'],
    });
  });

  it('answers nothing, so the group hides, before the list has loaded', () => {
    expect(answer(provider({ assets: [] }), 'trit')).toEqual([]);
  });
});

describe('loadPaletteAssets', () => {
  const fetchSpy = vi.fn();

  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
    await Promise.all([db.characters.clear(), db.tokens.clear(), db.esiCache.clear()]);
    await db.characters.bulkPut([
      { characterId: 1, name: 'Main', ownerHash: 'a', addedAt: 1 },
      { characterId: 2, name: 'Alt', ownerHash: 'b', addedAt: 2 },
    ] as never);
    await writeCached(1, 'assets', [asset(1, 34, 100)], Date.now());
    // Lapsed on purpose: a stale list is still read, never refreshed.
    await writeCached(2, 'assets', [asset(2, 587, 1)], 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function grant(characterId: number, scopes: string[]) {
    await db.tokens.put({
      characterId,
      accessToken: 'x',
      refreshToken: 'y',
      expiresAt: Date.now() + 60_000,
      scopes,
    });
  }

  it('reads only Characters that granted the assets scope, from cache alone', async () => {
    await grant(1, [ASSETS_SCOPE]);
    await grant(2, ['esi-skills.read_skills.v1']);
    const rows = await loadPaletteAssets();
    expect(rows.map((r) => r.name)).toEqual(['Tritanium']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses a lapsed cached list without refreshing it', async () => {
    await grant(1, [ASSETS_SCOPE]);
    await grant(2, [ASSETS_SCOPE]);
    const rows = await loadPaletteAssets();
    expect(rows.map((r) => r.name).sort()).toEqual(['Rifter', 'Tritanium']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('names every Character without a grant or a cached list as missing', async () => {
    await grant(1, [ASSETS_SCOPE]);
    await grant(2, ['esi-skills.read_skills.v1']);
    expect(await loadPaletteAssetsScope()).toEqual({ total: 2, missing: ['Alt'] });
    await db.esiCache.clear();
    expect(await loadPaletteAssetsScope()).toEqual({ total: 2, missing: ['Main', 'Alt'] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is empty when no Character granted the scope', async () => {
    await grant(1, []);
    expect(await loadPaletteAssets()).toEqual([]);
  });
});
