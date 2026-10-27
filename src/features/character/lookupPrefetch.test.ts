import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterAsset, Contract, MarketOrder } from '@/esi/endpoints';

const mocks = vi.hoisted(() => ({
  readCached: vi.fn(),
  resolveNames: vi.fn(async () => new Map()),
  loadStructureName: vi.fn(async () => 'x'),
  loadContractLocationName: vi.fn(async () => 'x'),
  loadLoyaltyStoreOffers: vi.fn(async () => null),
  loadCorporationName: vi.fn(async () => null),
  loadTypeDetail: vi.fn(async () => null),
  allowed: true,
}));

vi.mock('@/esi/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/esi/cache')>()),
  readCached: mocks.readCached,
}));
vi.mock('./names', () => ({ resolveNames: mocks.resolveNames }));
vi.mock('./structures', () => ({ loadStructureName: mocks.loadStructureName }));
vi.mock('./contractLocationName', () => ({
  loadContractLocationName: mocks.loadContractLocationName,
}));
vi.mock('@/features/loyalty/store', () => ({
  loadLoyaltyStoreOffers: mocks.loadLoyaltyStoreOffers,
  loadCorporationName: mocks.loadCorporationName,
}));
vi.mock('@/features/skills/typeDetail', () => ({ loadTypeDetail: mocks.loadTypeDetail }));
vi.mock('@/lib/lazyAssetWarmGate', () => ({
  currentWarmLevel: () => (mocks.allowed ? 'all' : 'none'),
}));

import {
  LP_STORE_PREFETCH_LIMIT,
  STRUCTURE_PREFETCH_LIMIT,
  implantTypeIdsFor,
  lpStoreCorporationsFor,
  nameIdsFor,
  structureIdsFor,
  warmImplantTypes,
  warmLoyaltyStores,
  warmNames,
  warmStructureNames,
} from './lookupPrefetch';

const FLOOR = 1_000_000_000_000;
const contract = (over: Partial<Contract>): Contract =>
  ({
    contract_id: 1,
    issuer_id: 10,
    issuer_corporation_id: 20,
    assignee_id: 0,
    acceptor_id: 0,
    for_corporation: false,
    availability: 'personal',
    ...over,
  }) as Contract;

function seed(rows: Record<string, unknown>) {
  mocks.readCached.mockImplementation(async (_c: number, key: string) => rows[key]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
});

describe('nameIdsFor', () => {
  it('collects mail parties (not mailing lists), contract parties and LP corporations', () => {
    const ids = nameIdsFor({
      characterId: 1,
      headers: [
        {
          mail_id: 1,
          from: 5,
          recipients: [
            { recipient_id: 6, recipient_type: 'character' },
            { recipient_id: 7, recipient_type: 'mailing_list' },
          ],
        },
      ],
      contracts: [contract({ issuer_id: 10, assignee_id: 11, acceptor_id: 0 })],
      loyalty: [{ corporation_id: 99, loyalty_points: 1 }],
    });
    expect(ids.sort((a, b) => a - b)).toEqual([5, 6, 10, 11, 99]);
  });
});

describe('structureIdsFor', () => {
  const asset = (over: Partial<CharacterAsset>): CharacterAsset =>
    ({ item_id: 1, location_id: 1, location_type: 'station', ...over }) as CharacterAsset;

  it('takes structure ids from assets, orders, clones and contracts; skips NPC stations', () => {
    const result = structureIdsFor({
      assets: [
        asset({ item_id: 1, location_id: FLOOR + 1, location_type: 'other' }),
        asset({ item_id: 2, location_id: 60000004, location_type: 'station' }),
        asset({ item_id: 3, location_id: FLOOR + 9, location_type: 'item' }),
        asset({ item_id: 4, location_id: 1, location_type: 'item' }),
      ],
      orders: [{ location_id: FLOOR + 2 }, { location_id: 60000004 }] as MarketOrder[],
      clones: {
        jump_clones: [
          { jump_clone_id: 1, location_id: FLOOR + 3, location_type: 'structure', implants: [] },
          { jump_clone_id: 2, location_id: 60000004, location_type: 'station', implants: [] },
        ],
        home_location: { location_id: FLOOR + 4, location_type: 'structure' },
      },
      contracts: [contract({ start_location_id: FLOOR + 5, end_location_id: 60000004 })],
    });
    expect(result.contractLocations).toEqual([FLOOR + 5]);
    expect(result.structures.sort((a, b) => a - b)).toEqual([
      FLOOR + 1,
      FLOOR + 2,
      FLOOR + 3,
      FLOOR + 4,
      FLOOR + 9,
    ]);
  });

  it('does not resolve a structure twice when a contract also names it', () => {
    const result = structureIdsFor({
      assets: [],
      orders: [{ location_id: FLOOR + 5 }] as MarketOrder[],
      clones: undefined,
      contracts: [contract({ start_location_id: FLOOR + 5 })],
    });
    expect(result).toEqual({ contractLocations: [FLOOR + 5], structures: [] });
  });

  it('is bounded', () => {
    const orders = Array.from({ length: 500 }, (_, i) => ({ location_id: FLOOR + i }));
    const result = structureIdsFor({
      assets: [],
      orders: orders as MarketOrder[],
      clones: undefined,
      contracts: [],
    });
    expect(result.structures).toHaveLength(STRUCTURE_PREFETCH_LIMIT);
  });
});

describe('small collectors', () => {
  it('implantTypeIdsFor merges worn and jump-clone implants without duplicates', () => {
    expect(
      implantTypeIdsFor([1, 2], {
        jump_clones: [
          { jump_clone_id: 1, location_id: 1, location_type: 'station', implants: [2, 3] },
        ],
      })
    ).toEqual([1, 2, 3]);
  });

  it('lpStoreCorporationsFor keeps the largest balances, bounded', () => {
    const loyalty = Array.from({ length: 40 }, (_, i) => ({
      corporation_id: i + 1,
      loyalty_points: i,
    }));
    const picked = lpStoreCorporationsFor(loyalty);
    expect(picked).toHaveLength(LP_STORE_PREFETCH_LIMIT);
    expect(picked[0]).toBe(40);
  });
});

describe('warmNames', () => {
  it('resolves the ids from the cached lists in one resolveNames call', async () => {
    seed({
      'mail:headers': [{ mail_id: 1, from: 5 }],
      loyalty: [{ corporation_id: 99, loyalty_points: 1 }],
    });
    await warmNames(1);
    expect(mocks.resolveNames).toHaveBeenCalledTimes(1);
    expect(mocks.resolveNames.mock.calls[0]).toEqual([[5, 99]]);
  });

  it('does nothing on a restricted connection', async () => {
    mocks.allowed = false;
    seed({ 'mail:headers': [{ mail_id: 1, from: 5 }] });
    await warmNames(1);
    expect(mocks.resolveNames).not.toHaveBeenCalled();
  });
});

describe('warmStructureNames', () => {
  it('resolves structures through the page loaders', async () => {
    seed({
      orders: [{ location_id: FLOOR + 2 }],
      contracts: [contract({ start_location_id: FLOOR + 5 })],
    });
    await warmStructureNames(3);
    expect(mocks.loadStructureName).toHaveBeenCalledWith(3, FLOOR + 2);
    expect(mocks.loadContractLocationName).toHaveBeenCalledWith(3, FLOOR + 5);
  });

  it('does nothing on a restricted connection', async () => {
    mocks.allowed = false;
    seed({ orders: [{ location_id: FLOOR + 2 }] });
    await warmStructureNames(3);
    expect(mocks.loadStructureName).not.toHaveBeenCalled();
  });
});

describe('warmLoyaltyStores and warmImplantTypes', () => {
  it('warms offers and corporation name per LP corporation', async () => {
    seed({ loyalty: [{ corporation_id: 99, loyalty_points: 5 }] });
    await warmLoyaltyStores(1);
    expect(mocks.loadLoyaltyStoreOffers).toHaveBeenCalledWith(99);
    expect(mocks.loadCorporationName).toHaveBeenCalledWith(99);
  });

  it('warms implant types, worn and in jump clones', async () => {
    seed({
      implants: [1],
      clones: {
        jump_clones: [
          { jump_clone_id: 1, location_id: 1, location_type: 'station', implants: [2] },
        ],
      },
    });
    await warmImplantTypes(1);
    expect(mocks.loadTypeDetail.mock.calls.map((c) => (c as unknown[])[0])).toEqual([1, 2]);
  });
});
