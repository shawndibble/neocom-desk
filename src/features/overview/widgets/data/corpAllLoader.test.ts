import { beforeEach, describe, expect, it, vi } from 'vitest';

const A = 98000001;
const B = 98000002;
/** Character 1 reads corporation A, Character 2 corporation B. */
const CORP_OF: Record<number, number> = { 1: A, 2: B };

const loadCorporationCustomsOffices = vi.fn();
const loadCorporationContracts = vi.fn();
vi.mock('@/features/corp/corpReadAccess', () => ({
  resolveCorpReadAccess: async (characterId: number) => ({
    corporationId: CORP_OF[characterId],
    can: () => true,
  }),
  accountCorpReaders: async () =>
    new Map([
      [A, 1],
      [B, 2],
    ]),
}));
vi.mock('@/features/corp/corpTicker', () => ({
  loadCorpLabels: async (ids: number[]) =>
    new Map(ids.map((id) => [id, { ticker: `T${id}`, name: `Corp ${id}` }])),
}));
vi.mock('@/features/corp/customsOffices', () => ({
  loadCorporationCustomsOffices: (...a: unknown[]) => loadCorporationCustomsOffices(...a),
}));
vi.mock('@/features/corp/contracts', () => ({
  loadCorporationContracts: (...a: unknown[]) => loadCorporationContracts(...a),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async () => new Map([[2233, 'Customs Office']]),
}));
vi.mock('@/features/character/names', () => ({ resolveNames: async () => new Map() }));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: async () => new Map([[30002813, { name: 'Tama' }]]),
}));

import { loadCorpContractsAll, loadCorpCustomsAll } from './corpFeedLoaders';

const landed = <T>(data: T, fetchedAt = new Date(0)) => ({
  cached: { data, fetchedAt, fromCache: false },
  needsReauth: false,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadCorpCustomsAll', () => {
  it('lists every corporation’s offices, each under its corporation', async () => {
    loadCorporationCustomsOffices.mockImplementation(async (characterId: number) =>
      landed(
        [{ office_id: characterId * 10, system_id: 30002813, type_id: 2233 }],
        new Date(characterId * 1000)
      )
    );
    const feed = await loadCorpCustomsAll();
    expect(feed.offices.map((o) => o.office_id)).toEqual([10, 20]);
    expect([...feed.corporationOf!]).toEqual([
      ['10', A],
      ['20', B],
    ]);
    expect(feed.corporations!.get(B)!.ticker).toBe(`T${B}`);
    expect(feed.systemNames.get(30002813)).toBe('Tama');
    // Only as fresh as the stalest corporation.
    expect(feed.fetchedAt).toEqual(new Date(1000));
    expect(feed.partlyFailed).toBe(false);
  });

  it('keeps the other corporation’s offices when one read fails, flagged', async () => {
    loadCorporationCustomsOffices.mockImplementation(async (characterId: number) => {
      if (characterId === 2) throw new Error('ESI down');
      return landed([{ office_id: 10, system_id: 30002813, type_id: 2233 }]);
    });
    const feed = await loadCorpCustomsAll();
    expect(feed.offices.map((o) => o.office_id)).toEqual([10]);
    expect(feed.partlyFailed).toBe(true);
  });

  it('fails as a whole only when every corporation’s read fails', async () => {
    loadCorporationCustomsOffices.mockRejectedValue(new Error('ESI down'));
    await expect(loadCorpCustomsAll()).rejects.toThrow();
  });
});

describe('loadCorpContractsAll', () => {
  it('keeps a contract between two of the corporations once, under its issuer', async () => {
    const shared = {
      contract_id: 5,
      issuer_id: 1,
      issuer_corporation_id: B,
      assignee_id: B,
      status: 'outstanding',
      type: 'item_exchange',
    };
    loadCorporationContracts.mockImplementation(async (characterId: number) =>
      landed(characterId === 1 ? [shared] : [shared, { ...shared, contract_id: 6 }])
    );
    const feed = await loadCorpContractsAll();
    expect(feed.contracts.map((c) => c.contract_id)).toEqual([5, 6]);
    // Read first through corporation A, but B issued it.
    expect(feed.corporationOf!.get('5')).toBe(B);
  });
});
