import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadBlueprintSourceSets } from './blueprintSourceSets';

vi.mock('./data', () => ({ loadCharacterBlueprints: vi.fn() }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: vi.fn() }));
vi.mock('@/features/bpcContracts/syncedContracts', () => ({ loadPublicBpcContracts: vi.fn() }));
vi.mock('@/features/character/loyalty', () => ({
  loadCharacterLoyaltyPoints: vi.fn(),
  PARAGON_CORPORATION_ID: 1000419,
}));
vi.mock('@/features/loyalty/store', () => ({ loadLoyaltyStoreOffers: vi.fn() }));
vi.mock('@/sde/marketTypesById', () => ({ loadMarketTypesById: vi.fn() }));
vi.mock('@/sde/loadMarketSde', () => ({ loadVariations: vi.fn() }));

import { loadCharacterBlueprints } from './data';
import { isSyncConfigured } from '@/app/syncStatus';
import { loadPublicBpcContracts } from '@/features/bpcContracts/syncedContracts';
import { loadCharacterLoyaltyPoints } from '@/features/character/loyalty';
import { loadLoyaltyStoreOffers } from '@/features/loyalty/store';
import { loadMarketTypesById } from '@/sde/marketTypesById';
import { loadVariations } from '@/sde/loadMarketSde';

type Resolved<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;

const CORP = 1000180;

/** Blueprint 20 builds T1 product 120; 21 builds 121, which has no market group. */
const BUILDABLE = [
  { blueprintTypeID: 10, productTypeID: 110 },
  { blueprintTypeID: 20, productTypeID: 120 },
  { blueprintTypeID: 21, productTypeID: 121 },
];
const T1_ON_MARKET = [{ blueprintTypeID: 20, productTypeID: 120 }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadCharacterBlueprints).mockResolvedValue({
    cached: { data: [{ type_id: 10 }] },
    needsReauth: false,
  } as unknown as Resolved<typeof loadCharacterBlueprints>);
  vi.mocked(loadMarketTypesById).mockResolvedValue(
    new Map([
      [20, {}],
      [22, {}],
    ]) as unknown as Resolved<typeof loadMarketTypesById>
  );
  vi.mocked(loadVariations).mockResolvedValue({
    types: {
      120: { parentTypeId: null, metaGroupId: 1 },
      122: { parentTypeId: 120, metaGroupId: 2 },
    },
    metaGroups: {},
  } as unknown as Resolved<typeof loadVariations>);
  vi.mocked(isSyncConfigured).mockReturnValue(true);
  vi.mocked(loadPublicBpcContracts).mockResolvedValue({
    data: { rows: [{ typeId: 30 }], originals: [{ typeId: 31 }], lastSyncedAt: 1 },
  } as unknown as Resolved<typeof loadPublicBpcContracts>);
  vi.mocked(loadCharacterLoyaltyPoints).mockResolvedValue({
    cached: {
      data: [
        { corporation_id: CORP, loyalty_points: 5_000 },
        { corporation_id: 999, loyalty_points: 0 },
      ],
    },
    needsReauth: false,
  } as unknown as Resolved<typeof loadCharacterLoyaltyPoints>);
  vi.mocked(loadLoyaltyStoreOffers).mockResolvedValue({
    data: [{ type_id: 40 }],
  } as unknown as Resolved<typeof loadLoyaltyStoreOffers>);
});

describe('loadBlueprintSourceSets', () => {
  it('collects every source’s blueprints', async () => {
    const { sets, unavailable } = await loadBlueprintSourceSets([1], BUILDABLE);
    expect(sets.owned).toEqual(new Set([10]));
    expect(sets.market).toEqual(new Set([20]));
    expect(sets.contract).toEqual(new Set([30, 31]));
    expect(sets.lpStore).toEqual(new Set([40]));
    expect(unavailable).toEqual([]);
  });

  it('leaves a market-grouped blueprint off the NPC market when its product is not Tech I', async () => {
    // e.g. the Vagabond Blueprint: market-grouped, but a T2 lottery BPO no NPC sells.
    const { sets } = await loadBlueprintSourceSets(
      [1],
      [...T1_ON_MARKET, { blueprintTypeID: 22, productTypeID: 122 }]
    );
    expect(sets.market).toEqual(new Set([20]));
  });

  it('reads only LP stores the account holds points with', async () => {
    await loadBlueprintSourceSets([1], []);
    expect(vi.mocked(loadLoyaltyStoreOffers).mock.calls).toEqual([[CORP]]);
  });

  it('names contracts unavailable when sync is not configured', async () => {
    vi.mocked(isSyncConfigured).mockReturnValue(false);
    const { sets, unavailable } = await loadBlueprintSourceSets([1], T1_ON_MARKET);
    expect(sets.contract.size).toBe(0);
    expect(unavailable).toEqual(['contract']);
  });

  it('falls back to the next Character when one cannot read the contract snapshot', async () => {
    vi.mocked(loadPublicBpcContracts)
      .mockRejectedValueOnce(new Error('revoked'))
      .mockResolvedValueOnce({
        data: { rows: [{ typeId: 32 }], lastSyncedAt: 1 },
      } as unknown as Resolved<typeof loadPublicBpcContracts>);
    const { sets, unavailable } = await loadBlueprintSourceSets([1, 2], []);
    expect(sets.contract).toEqual(new Set([32]));
    expect(unavailable).toEqual([]);
  });

  it('names contracts unavailable when the snapshot has never synced', async () => {
    vi.mocked(loadPublicBpcContracts).mockResolvedValue({
      data: { rows: [], lastSyncedAt: null },
    } as unknown as Resolved<typeof loadPublicBpcContracts>);
    const { unavailable } = await loadBlueprintSourceSets([1], []);
    expect(unavailable).toEqual(['contract']);
  });

  it('names contracts and LP stores unavailable with no Character to read them as', async () => {
    const { unavailable } = await loadBlueprintSourceSets([], T1_ON_MARKET);
    expect(unavailable).toEqual(['contract', 'lpStore']);
  });

  it('degrades a throwing source to unavailable rather than failing the whole load', async () => {
    vi.mocked(loadMarketTypesById).mockRejectedValue(new Error('offline'));
    const { sets, unavailable } = await loadBlueprintSourceSets([1], T1_ON_MARKET);
    expect(sets.market.size).toBe(0);
    expect(sets.owned).toEqual(new Set([10]));
    expect(unavailable).toEqual(['market']);
  });

  it('names owned blueprints unavailable when a Character’s list could not be read', async () => {
    vi.mocked(loadCharacterBlueprints).mockResolvedValue({
      cached: null,
      needsReauth: true,
    } as unknown as Resolved<typeof loadCharacterBlueprints>);
    const { unavailable } = await loadBlueprintSourceSets([1], []);
    expect(unavailable).toEqual(['owned']);
  });
});
