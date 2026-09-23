import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiError } from '@/esi/errors';

const TRADABLE = 1230; // Veldspar
const NONTRADABLE = 28617; // Banidine — no market, ESI 400s its /markets/{region}/history

const ledgerMock = vi.hoisted(() => ({ loadAllCharacterYields: vi.fn() }));
vi.mock('./ledger', () => ledgerMock);

const sdeMock = vi.hoisted(() => ({
  loadCompressedOreTypeIds: vi.fn(),
  loadReprocessing: vi.fn(),
  loadTypes: vi.fn(),
}));
vi.mock('@/sde/loadSde', () => sdeMock);

const priceHistoryMock = vi.hoisted(() => ({ loadPriceHistory: vi.fn() }));
vi.mock('@/features/market/priceHistory', () => priceHistoryMock);

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

const snapshotsMock = vi.hoisted(() => ({
  saveTodayPriceSnapshot: vi.fn(),
  loadPriceSnapshots: vi.fn(),
}));
vi.mock('./priceSnapshots', () => snapshotsMock);

import { loadMiningYieldSnapshot } from './yieldSnapshot';

beforeEach(() => {
  vi.clearAllMocks();
  hubPricesMock.getHubPrices.mockResolvedValue(new Map());
  snapshotsMock.saveTodayPriceSnapshot.mockResolvedValue(undefined);
  snapshotsMock.loadPriceSnapshots.mockResolvedValue(new Map());
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
  it('resolves with partial pricing when one type_id 400s as non-tradable, rather than failing the whole page', async () => {
    priceHistoryMock.loadPriceHistory.mockImplementation((_regionId: number, typeId: number) => {
      if (typeId === NONTRADABLE) {
        return Promise.reject(new EsiError(400, 'Type not tradable on market!'));
      }
      return Promise.resolve({
        points: [{ date: '2026-09-01', average: 10, volume: 1 }],
        fetchedAt: Date.now(),
      });
    });

    const snapshot = await loadMiningYieldSnapshot();

    const [row] = snapshot.rows;
    const tradableLine = row.valuation.lines.find((l) => l.typeId === TRADABLE);
    const nontradableLine = row.valuation.lines.find((l) => l.typeId === NONTRADABLE);
    expect(tradableLine?.rawValue).toBe(1000);
    expect(nontradableLine?.rawValue).toBe(0);
    expect(row.valuation.pricedAll).toBe(false);
  });

  it('still fails the whole snapshot on a non-400 failure, rather than silently pricing it as not tradable', async () => {
    priceHistoryMock.loadPriceHistory.mockImplementation((_regionId: number, typeId: number) => {
      if (typeId === NONTRADABLE) {
        return Promise.reject(new EsiError(503, 'Service unavailable'));
      }
      return Promise.resolve({
        points: [{ date: '2026-09-01', average: 10, volume: 1 }],
        fetchedAt: Date.now(),
      });
    });

    await expect(loadMiningYieldSnapshot()).rejects.toThrow('Service unavailable');
  });

  it('carries per-unit volume and the names of the materials the ore refines into', async () => {
    // Detail-modal inputs: an unnamed "#34" in a refining list is no use to a
    // miner, and m³ is what an ore hold is measured in.
    sdeMock.loadTypes.mockResolvedValue({ [String(TRADABLE)]: { volume: 0.1 } });
    sdeMock.loadReprocessing.mockResolvedValue({
      [String(TRADABLE)]: { portionSize: 100, materials: [{ typeID: 34, quantity: 400 }] },
    });
    priceHistoryMock.loadPriceHistory.mockResolvedValue({
      points: [{ date: '2026-09-01', average: 10, volume: 1 }],
      fetchedAt: Date.now(),
    });

    const snapshot = await loadMiningYieldSnapshot();

    expect(snapshot.typeVolumes.get(TRADABLE)).toBe(0.1);
    expect(typeNamesMock.loadTypeNames).toHaveBeenCalledWith(
      expect.arrayContaining([TRADABLE, 34])
    );
    expect(snapshot.rows[0].materialUnitPrices.get(34)).toBe(10);
  });

  it('fetches a type volume from ESI when the SDE bake has no entry for it (issue #1283)', async () => {
    // TRADABLE has a volume in the SDE bake; NONTRADABLE (a hand-tagged
    // override type) does not, so it must fall back to ESI.
    sdeMock.loadTypes.mockResolvedValue({ [String(TRADABLE)]: { volume: 0.1 } });
    endpointsMock.getUniverseType.mockImplementation((typeId: number) =>
      Promise.resolve({ data: { type_id: typeId, volume: 0.05 } })
    );
    priceHistoryMock.loadPriceHistory.mockResolvedValue({
      points: [{ date: '2026-09-01', average: 10, volume: 1 }],
      fetchedAt: Date.now(),
    });

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
    priceHistoryMock.loadPriceHistory.mockResolvedValue({
      points: [{ date: '2026-09-01', average: 10, volume: 1 }],
      fetchedAt: Date.now(),
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
    priceHistoryMock.loadPriceHistory.mockResolvedValue({
      points: [{ date: '2026-09-01', average: 10, volume: 1 }],
      fetchedAt: Date.now(),
    });

    const snapshot = await loadMiningYieldSnapshot();

    expect(snapshot.typeVolumes.has(NONTRADABLE)).toBe(false);
    expect(endpointsMock.getUniverseType).not.toHaveBeenCalled();
  });

  it('uses a cached volume instead of calling ESI again', async () => {
    sdeMock.loadTypes.mockResolvedValue({ [String(TRADABLE)]: { volume: 0.1 } });
    cacheMock.readCachedEntries.mockResolvedValue(
      new Map([[`type-volume:${NONTRADABLE}`, { value: 0.07, fetchedAt: Date.now() }]])
    );
    priceHistoryMock.loadPriceHistory.mockResolvedValue({
      points: [{ date: '2026-09-01', average: 10, volume: 1 }],
      fetchedAt: Date.now(),
    });

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
    priceHistoryMock.loadPriceHistory.mockResolvedValue({
      points: [{ date: '2026-09-01', average: 10, volume: 1 }],
      fetchedAt: Date.now(),
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
      priceHistoryMock.loadPriceHistory.mockResolvedValue({
        points: [{ date: '2026-09-01', average: 10, volume: 1 }],
        fetchedAt: Date.now(),
      });

      const snapshot = await loadMiningYieldSnapshot(false);

      expect(sdeMock.loadReprocessing).not.toHaveBeenCalled();
      expect(skillsMock.loadCorrectedSkills).not.toHaveBeenCalled();
      // Only the ore/ice types themselves are priced — never material 34,
      // which only a refine valuation would ever need a price for.
      const historyTypeIds = priceHistoryMock.loadPriceHistory.mock.calls.map(
        (call: unknown[]) => call[1]
      );
      expect(historyTypeIds).not.toContain(34);

      const [row] = snapshot.rows;
      expect(row.valuation.refineValue).toBe(0);
      // Raw pricing is still complete, so the row must not read as Partial
      // for refine data that was never fetched on purpose.
      expect(row.valuation.pricedAll).toBe(true);
    });
  });

  describe('price basis (issue #1279)', () => {
    const book = { buyMax: 8, sellMin: 12, buyVolume: 1, sellVolume: 1 };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
      priceHistoryMock.loadPriceHistory.mockResolvedValue({ points: [], fetchedAt: Date.now() });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("saves today's live Jita book and prices today from it as saved, per side", async () => {
      hubPricesMock.getHubPrices.mockResolvedValue(new Map([[TRADABLE, book]]));
      snapshotsMock.loadPriceSnapshots.mockResolvedValue(
        new Map([['2026-09-01', { [TRADABLE]: { buy: 8, sell: 12 } }]])
      );

      const [row] = (await loadMiningYieldSnapshot()).rows;

      expect(snapshotsMock.saveTodayPriceSnapshot).toHaveBeenCalledWith('2026-09-01', {
        [TRADABLE]: { buy: 8, sell: 12 },
      });
      const line = (basis: 'buy' | 'sell') =>
        row.byBasis[basis].valuation.lines.find((l) => l.typeId === TRADABLE)?.rawValue;
      expect(line('buy')).toBe(800);
      expect(line('sell')).toBe(1200);
      expect(row.byBasis.buy.priceSource).toBe('saved');
      expect(row.valuation).toBe(row.byBasis.buy.valuation);
    });

    it('falls back to the live price for today when nothing was saved and ESI has no history yet', async () => {
      hubPricesMock.getHubPrices.mockResolvedValue(new Map([[TRADABLE, book]]));

      const [row] = (await loadMiningYieldSnapshot()).rows;

      expect(row.byBasis.buy.priceSource).toBe('live');
      expect(
        row.byBasis['now-sell'].valuation.lines.find((l) => l.typeId === TRADABLE)?.rawValue
      ).toBe(1200);
    });

    it('still loads when saving the snapshot fails', async () => {
      snapshotsMock.saveTodayPriceSnapshot.mockRejectedValue(new Error('QuotaExceeded'));

      await expect(loadMiningYieldSnapshot()).resolves.toMatchObject({ rows: [expect.anything()] });
    });
  });
});
