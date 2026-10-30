import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useHubByCharacter } from '@/features/market/characterHubs';
import { useDefaultMarketHub } from '@/features/market/hub';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  liveSources,
  recordAllNetWorthSnapshots,
  recordNetWorthSnapshot,
  type SnapshotSources,
} from './recordSnapshots';

vi.mock('@/sync', () => ({ scheduleSync: vi.fn() }));

const mocks = vi.hoisted(() => ({
  wallet: vi.fn(),
  assets: vi.fn(),
  orders: vi.fn(),
  hubPrices: vi.fn(),
  averages: vi.fn(),
  abyssal: vi.fn(),
}));
vi.mock('@/features/abyssal/abyssalEstimates', () => ({ lastKnownAbyssalValues: mocks.abyssal }));
vi.mock('@/features/character/wallet', () => ({ loadWalletBalanceWithStatus: mocks.wallet }));
vi.mock('@/features/assets/assets', () => ({ loadCharacterAssets: mocks.assets }));
vi.mock('@/features/character/orders', () => ({ loadOrders: mocks.orders }));
vi.mock('@/market/prices', () => ({
  getHubPrices: mocks.hubPrices,
  getAveragePriceByType: mocks.averages,
}));

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
        escrow: 7,
        sellStock: 0,
        hubId: 'jita',
        updatedAt: DAY1,
      },
    ]);
  });

  it('rewrites a same-day row that predates the Sell orders layer, once', async () => {
    const stale = {
      id: '1:2026-10-07',
      characterId: 1,
      day: '2026-10-07',
      wallet: 90,
      assetValue: 10,
      escrow: 7,
      hubId: 'jita',
      updatedAt: DAY1,
    };
    await db.netWorthSnapshots.put(stale);
    const fetch = vi.fn(async () => ({
      hubId: 'jita',
      wallet: 100,
      assets: [{ item_id: 1, type_id: 34, quantity: 2 }],
      orders: [
        { is_buy_order: true, escrow: 7 },
        { is_buy_order: false, price: 10, volume_remain: 3 },
        { is_buy_order: false, is_corporation: true, price: 100, volume_remain: 100 },
      ],
      priceByTypeId: new Map([[34, 5]]),
    }));
    const sources = { fetch } satisfies SnapshotSources;
    expect(await recordNetWorthSnapshot(1, sources, DAY1_LATER)).toBe('upgraded');
    expect(await db.netWorthSnapshots.toArray()).toEqual([
      { ...stale, wallet: 100, sellStock: 30, updatedAt: DAY1_LATER },
    ]);
    expect(await recordNetWorthSnapshot(1, sources, DAY1_LATER)).toBe('already-recorded');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('leaves a stale row alone when the inputs are missing', async () => {
    const stale = {
      id: '1:2026-10-07',
      characterId: 1,
      day: '2026-10-07',
      wallet: 90,
      assetValue: 10,
      escrow: 7,
      hubId: 'jita',
      updatedAt: DAY1,
    };
    await db.netWorthSnapshots.put(stale);
    expect(await recordNetWorthSnapshot(1, { fetch: async () => null }, DAY1_LATER)).toBe(
      'skipped'
    );
    expect(await db.netWorthSnapshots.toArray()).toEqual([stale]);
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

describe('liveSources.fetch', () => {
  const fresh = <T>(data: T) => ({
    cached: { data, fetchedAt: new Date(DAY1), fromCache: false, truncated: false },
    needsReauth: false,
  });
  // A hung call: the loader answers with the expired row, not flagged `fromCache`.
  const lieFi = <T>(data: T) => ({
    cached: {
      data,
      fetchedAt: new Date(DAY1 - 3 * 86_400_000),
      fromCache: false,
      truncated: false,
    },
    needsReauth: false,
  });
  const stale = <T>(data: T) => ({
    cached: { data, fetchedAt: new Date(DAY1 - 3 * 86_400_000), fromCache: true, truncated: false },
    needsReauth: false,
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(DAY1);
    const { REQUIRED_SCOPES } = await import('./recordSnapshots');
    await db.tokens.clear();
    await db.tokens.put({ characterId: 1, scopes: REQUIRED_SCOPES } as never);
    mocks.wallet.mockResolvedValue(fresh(100));
    mocks.assets.mockResolvedValue(fresh([{ item_id: 1, type_id: 34, quantity: 2 }]));
    mocks.orders.mockResolvedValue(fresh([]));
    mocks.hubPrices.mockResolvedValue(new Map([[34, { sellMin: 5 }]]));
    mocks.averages.mockResolvedValue(new Map());
    mocks.abyssal.mockResolvedValue({ isAbyssalType: () => false, values: new Map() });
  });

  it("prices at the polled character's own hub, not the active one's", async () => {
    useDefaultMarketHub.setState({ value: 'jita', hydrated: true });
    useHubByCharacter.setState({ value: { 1: 'hek', 2: 'amarr' }, hydrated: true });
    useActiveCharacter.setState({ activeCharacterId: 2, hydrated: true });
    await liveSources.fetch(1);
    expect(mocks.hubPrices.mock.calls[0][0]).toMatchObject({ id: 'hek' });
  });

  it('returns the figures when every source answered live', async () => {
    expect(await liveSources.fetch(1)).toMatchObject({ wallet: 100 });
  });

  it.each([
    ['wallet', () => mocks.wallet.mockResolvedValue(stale(100))],
    [
      'assets',
      () => mocks.assets.mockResolvedValue(stale([{ item_id: 1, type_id: 34, quantity: 2 }])),
    ],
    ['orders', () => mocks.orders.mockResolvedValue(stale([]))],
  ])('records nothing when the %s came from the cache', async (_name, degrade) => {
    degrade();
    expect(await liveSources.fetch(1)).toBeNull();
  });

  it.each([
    ['wallet', () => mocks.wallet.mockResolvedValue(lieFi(100))],
    [
      'assets',
      () => mocks.assets.mockResolvedValue(lieFi([{ item_id: 1, type_id: 34, quantity: 2 }])),
    ],
    ['orders', () => mocks.orders.mockResolvedValue(lieFi([]))],
  ])(
    'records nothing when the %s is an expired row served unflagged after a hung call',
    async (_name, degrade) => {
      degrade();
      expect(await liveSources.fetch(1)).toBeNull();
    }
  );

  it('values an abyssal module at its last known estimate, never a type price', async () => {
    const NEUT = 47832;
    mocks.assets.mockResolvedValue(
      fresh([
        { item_id: 1, type_id: 34, quantity: 2 },
        { item_id: 9, type_id: NEUT, quantity: 1 },
      ])
    );
    mocks.averages.mockResolvedValue(new Map([[NEUT, 1_000]]));
    mocks.abyssal.mockResolvedValue({
      isAbyssalType: (typeId: number) => typeId === NEUT,
      values: new Map([[9, 80_000_000]]),
    });
    const fetched = await liveSources.fetch(1);
    expect(fetched?.itemValueByItemId).toEqual(new Map([[9, 80_000_000]]));
    expect(fetched?.priceByTypeId.has(NEUT)).toBe(false);
    expect(mocks.hubPrices.mock.calls[0][1]).toEqual([34]);
  });

  it('records nothing when the mutaplasmid data would not load', async () => {
    mocks.abyssal.mockResolvedValue(null);
    expect(await liveSources.fetch(1)).toBeNull();
  });

  it('keeps the average-priced valuation when the hub lists none of the assets', async () => {
    mocks.hubPrices.mockResolvedValue(new Map([[34, { sellMin: null }]]));
    mocks.averages.mockResolvedValue(new Map([[34, 4]]));
    expect(await liveSources.fetch(1)).not.toBeNull();
  });
});
