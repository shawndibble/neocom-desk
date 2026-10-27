import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TRADABLE = 1230; // Veldspar
const NONTRADABLE = 28617; // Banidine — no market, so no hub prices

const ledgerMock = vi.hoisted(() => ({ loadAllCharacterYields: vi.fn() }));
vi.mock('./ledger', () => ledgerMock);

const sdeMock = vi.hoisted(() => ({
  loadCompressedOreTypeIds: vi.fn(),
  loadReprocessing: vi.fn(),
  loadTypes: vi.fn(),
}));
vi.mock('@/sde/loadSde', () => sdeMock);

const skillsMock = vi.hoisted(() => ({ loadCorrectedSkills: vi.fn() }));
vi.mock('@/features/skills/correctedSkills', () => skillsMock);

const typeNamesMock = vi.hoisted(() => ({ loadTypeNames: vi.fn() }));
vi.mock('@/features/character/typeNames', () => typeNamesMock);

const systemSecurityMock = vi.hoisted(() => ({ loadSystemNameAndSecurity: vi.fn() }));
vi.mock('@/features/character/systemSecurity', () => systemSecurityMock);

const endpointsMock = vi.hoisted(() => ({ getUniverseType: vi.fn() }));
vi.mock('@/esi/endpoints', () => endpointsMock);

const cacheMock = vi.hoisted(() => ({
  readCached: vi.fn(),
  writeCached: vi.fn(),
  readCachedEntries: vi.fn(),
}));
vi.mock('@/esi/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/esi/cache')>();
  return { ...actual, ...cacheMock };
});

const hubPricesMock = vi.hoisted(() => ({ getHubPrices: vi.fn() }));
vi.mock('@/market/prices', () => hubPricesMock);

// The server's hub prices, an R2 read.
const hubSnapshotMock = vi.hoisted(() => ({ loadHubSnapshotRange: vi.fn() }));
vi.mock('@/features/market/hubSnapshot', () => hubSnapshotMock);

/** The hub snapshot with one station day priced for `TRADABLE`. */
function stationDay(date: string, prices: { buy: number | null; sell: number | null }) {
  return { saved: new Map([[date, new Map([[TRADABLE, prices]])]]) };
}

import { loadMiningYieldSnapshot } from './yieldSnapshot';

beforeEach(() => {
  vi.clearAllMocks();
  hubPricesMock.getHubPrices.mockResolvedValue(new Map());
  // Every type priced at 10/12 on the mined day.
  hubSnapshotMock.loadHubSnapshotRange.mockImplementation(
    async (_start: string, _end: string, typeIds: number[]) => ({
      saved: new Map([['2026-09-01', new Map(typeIds.map((id) => [id, { buy: 10, sell: 12 }]))]]),
    })
  );
  sdeMock.loadCompressedOreTypeIds.mockResolvedValue({});
  sdeMock.loadReprocessing.mockResolvedValue({});
  sdeMock.loadTypes.mockResolvedValue({});
  skillsMock.loadCorrectedSkills.mockResolvedValue({ trained: new Map() });
  typeNamesMock.loadTypeNames.mockResolvedValue(new Map());
  systemSecurityMock.loadSystemNameAndSecurity.mockResolvedValue({
    name: 'Jita',
    security: 0.9,
  });
  endpointsMock.getUniverseType.mockReset();
  cacheMock.readCached.mockReset().mockResolvedValue(undefined);
  cacheMock.writeCached.mockReset().mockResolvedValue(undefined);
  cacheMock.readCachedEntries.mockReset().mockResolvedValue(new Map());
  ledgerMock.loadAllCharacterYields.mockResolvedValue([
    {
      characterId: 1,
      characterName: 'Pilot One',
      entries: [
        {
          characterId: 1,
          date: '2026-09-01',
          solarSystemId: 30000142,
          oreLines: [
            { typeId: TRADABLE, quantity: 100 },
            { typeId: NONTRADABLE, quantity: 50 },
          ],
        },
      ],
      needsReauth: false,
      fetchedAt: new Date('2026-09-01T00:00:00Z'),
      fromCache: false,
    },
  ]);
});

describe('loadMiningYieldSnapshot', () => {
  it('resolves with partial pricing when one type has no hub price, rather than failing the whole page', async () => {
    hubSnapshotMock.loadHubSnapshotRange.mockResolvedValue(
      stationDay('2026-09-01', { buy: 10, sell: 12 })
    );

    const snapshot = await loadMiningYieldSnapshot();

    const [row] = snapshot.rows;
    const tradableLine = row.valuation.lines.find((l) => l.typeId === TRADABLE);
    const nontradableLine = row.valuation.lines.find((l) => l.typeId === NONTRADABLE);
    expect(tradableLine?.rawValue).toBe(1000);
    expect(nontradableLine?.rawValue).toBe(0);
    expect(row.valuation.pricedAll).toBe(false);
  });

  it('carries per-unit volume and the names of the materials the ore refines into', async () => {
    // Detail-modal inputs: an unnamed "#34" in a refining list is no use to a
    // miner, and m³ is what an ore hold is measured in.
    sdeMock.loadTypes.mockResolvedValue({ [String(TRADABLE)]: { volume: 0.1 } });
    sdeMock.loadReprocessing.mockResolvedValue({
      [String(TRADABLE)]: { portionSize: 100, materials: [{ typeID: 34, quantity: 400 }] },
    });

    const snapshot = await loadMiningYieldSnapshot();

    expect(snapshot.typeVolumes.get(TRADABLE)).toBe(0.1);
    expect(typeNamesMock.loadTypeNames).toHaveBeenCalledWith([34]);
    expect(typeNamesMock.loadTypeNames).toHaveBeenCalledWith(expect.arrayContaining([TRADABLE]));
    expect(snapshot.rows[0].materialUnitPrices.get(34)).toBe(10);
  });

  it('fetches a type volume from ESI when the SDE bake has no entry for it (issue #1283)', async () => {
    // TRADABLE has a volume in the SDE bake; NONTRADABLE (a hand-tagged
    // override type) does not, so it must fall back to ESI.
    sdeMock.loadTypes.mockResolvedValue({ [String(TRADABLE)]: { volume: 0.1 } });
    endpointsMock.getUniverseType.mockImplementation((typeId: number) =>
      Promise.resolve({ data: { type_id: typeId, volume: 0.05 } })
    );

    const snapshot = await loadMiningYieldSnapshot();

    expect(snapshot.typeVolumes.get(TRADABLE)).toBe(0.1);
    expect(snapshot.typeVolumes.get(NONTRADABLE)).toBe(0.05);
    expect(endpointsMock.getUniverseType).toHaveBeenCalledWith(NONTRADABLE);
    expect(cacheMock.writeCached).toHaveBeenCalledWith(
      0,
      expect.any(String),
      0.05,
      expect.any(Number)
    );
  });

  it('leaves a type absent from typeVolumes when ESI also has no volume for it', async () => {
    sdeMock.loadTypes.mockResolvedValue({ [String(TRADABLE)]: { volume: 0.1 } });
    endpointsMock.getUniverseType.mockResolvedValue({
      data: { type_id: NONTRADABLE, name: 'Banidine' },
    });

    const snapshot = await loadMiningYieldSnapshot();

    expect(snapshot.typeVolumes.get(TRADABLE)).toBe(0.1);
    expect(snapshot.typeVolumes.has(NONTRADABLE)).toBe(false);
    // Cached as a confirmed negative, not left uncached to be re-asked every load.
    expect(cacheMock.writeCached).toHaveBeenCalledWith(
      0,
      expect.any(String),
      null,
      expect.any(Number)
    );
  });

  it('does not call ESI again for a type already cached as a confirmed no-volume', async () => {
    sdeMock.loadTypes.mockResolvedValue({ [String(TRADABLE)]: { volume: 0.1 } });
    cacheMock.readCachedEntries.mockResolvedValue(
      new Map([[`type-volume:${NONTRADABLE}`, { value: null, fetchedAt: Date.now() }]])
    );

    const snapshot = await loadMiningYieldSnapshot();

    expect(snapshot.typeVolumes.has(NONTRADABLE)).toBe(false);
    expect(endpointsMock.getUniverseType).not.toHaveBeenCalled();
  });

  it('uses a cached volume instead of calling ESI again', async () => {
    sdeMock.loadTypes.mockResolvedValue({ [String(TRADABLE)]: { volume: 0.1 } });
    cacheMock.readCachedEntries.mockResolvedValue(
      new Map([[`type-volume:${NONTRADABLE}`, { value: 0.07, fetchedAt: Date.now() }]])
    );

    const snapshot = await loadMiningYieldSnapshot();

    expect(snapshot.typeVolumes.get(NONTRADABLE)).toBe(0.07);
    expect(endpointsMock.getUniverseType).not.toHaveBeenCalled();
  });

  it('serves a stale cached volume immediately rather than blocking on a refresh', async () => {
    sdeMock.loadTypes.mockResolvedValue({ [String(TRADABLE)]: { volume: 0.1 } });
    const staleFetchedAt = Date.now() - 25 * 60 * 60_000; // older than STALE_AFTER.static (24h)
    cacheMock.readCachedEntries.mockResolvedValue(
      new Map([[`type-volume:${NONTRADABLE}`, { value: 0.07, fetchedAt: staleFetchedAt }]])
    );
    endpointsMock.getUniverseType.mockResolvedValue({
      data: { type_id: NONTRADABLE, volume: 0.09 },
    });

    const snapshot = await loadMiningYieldSnapshot();

    // The stale value renders immediately, not the fresh one a background
    // refresh may still be fetching when this promise resolves.
    expect(snapshot.typeVolumes.get(NONTRADABLE)).toBe(0.07);
  });

  describe('showRefining off (issue #1281)', () => {
    it('skips reprocessing recipes, material prices, and character skills/implants entirely', async () => {
      sdeMock.loadReprocessing.mockResolvedValue({
        [String(TRADABLE)]: { portionSize: 100, materials: [{ typeID: 34, quantity: 400 }] },
      });

      const snapshot = await loadMiningYieldSnapshot(false);

      expect(sdeMock.loadReprocessing).not.toHaveBeenCalled();
      expect(skillsMock.loadCorrectedSkills).not.toHaveBeenCalled();
      // Only the ore/ice types themselves are priced — never material 34,
      // which only a refine valuation would ever need a price for.
      expect(hubSnapshotMock.loadHubSnapshotRange.mock.calls[0][2]).not.toContain(34);
      expect(hubPricesMock.getHubPrices.mock.calls[0][1]).not.toContain(34);

      const [row] = snapshot.rows;
      expect(row.valuation.refineValue).toBe(0);
      // Raw pricing is still complete, so the row must not read as Partial
      // for refine data that was never fetched on purpose.
      expect(row.valuation.pricedAll).toBe(true);
    });
  });

  describe('reprocessing data missing (offline)', () => {
    it('keeps the ledger and raw values, and flags refining as unavailable, rather than failing the snapshot', async () => {
      sdeMock.loadReprocessing.mockRejectedValue(new Error('offline'));

      const snapshot = await loadMiningYieldSnapshot(true);

      expect(snapshot.refiningUnavailable).toBe(true);
      expect(snapshot.rows).toHaveLength(1);
      expect(snapshot.rows[0].valuation.rawValue).toBeGreaterThan(0);
      // Not Partial for refine data that cannot exist right now.
      expect(snapshot.rows[0].valuation.pricedAll).toBe(true);
      expect(skillsMock.loadCorrectedSkills).not.toHaveBeenCalled();
    });

    it('does not flag it when refining is off or the data loaded', async () => {
      expect((await loadMiningYieldSnapshot(false)).refiningUnavailable).toBe(false);
      expect((await loadMiningYieldSnapshot(true)).refiningUnavailable).toBe(false);
    });
  });

  describe('price basis (issue #1279)', () => {
    const book = { buyMax: 8, sellMin: 12, buyVolume: 1, sellVolume: 1 };
    const valueOn = (
      row: {
        byBasis: Record<string, { valuation: { lines: { typeId: number; rawValue: number }[] } }>;
      },
      basis: string
    ) => row.byBasis[basis].valuation.lines.find((l) => l.typeId === TRADABLE)?.rawValue;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
      hubPricesMock.getHubPrices.mockResolvedValue(new Map([[TRADABLE, book]]));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("prices the mined day at that day's hub buy or sell, per side", async () => {
      hubSnapshotMock.loadHubSnapshotRange.mockResolvedValue(
        stationDay('2026-09-01', { buy: 9, sell: 11 })
      );

      const [row] = (await loadMiningYieldSnapshot()).rows;

      expect(valueOn(row, 'buy')).toBe(900);
      expect(valueOn(row, 'sell')).toBe(1100);
      expect(row.valuation).toBe(row.byBasis.buy.valuation);
    });

    it("values every day at today's live price on a now basis", async () => {
      const [row] = (await loadMiningYieldSnapshot()).rows;

      expect(valueOn(row, 'now-buy')).toBe(800);
      expect(valueOn(row, 'now-sell')).toBe(1200);
    });

    it("falls back to today's live price for yesterday, before the day is published", async () => {
      vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
      hubSnapshotMock.loadHubSnapshotRange.mockResolvedValue({
        saved: new Map(),
      });

      const [row] = (await loadMiningYieldSnapshot()).rows;

      expect(valueOn(row, 'buy')).toBe(800);
    });

    it('leaves an older unpublished day unpriced rather than using the live price', async () => {
      hubSnapshotMock.loadHubSnapshotRange.mockResolvedValue({
        saved: new Map(),
      });

      const [row] = (await loadMiningYieldSnapshot()).rows;

      expect(valueOn(row, 'buy')).toBe(0);
      expect(row.valuation.pricedAll).toBe(false);
    });
  });
});
