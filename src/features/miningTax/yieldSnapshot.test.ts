import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiError } from '@/esi/errors';

const TRADABLE = 1230; // Veldspar
const NONTRADABLE = 28617; // Banidine — no market, ESI 400s its /markets/{region}/history

const ledgerMock = vi.hoisted(() => ({ loadAllCharacterYields: vi.fn() }));
vi.mock('./ledger', () => ledgerMock);

const sdeMock = vi.hoisted(() => ({
  loadCompressedOreTypeIds: vi.fn(),
  loadReprocessing: vi.fn(),
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

import { loadMiningYieldSnapshot } from './yieldSnapshot';

beforeEach(() => {
  vi.clearAllMocks();
  sdeMock.loadCompressedOreTypeIds.mockResolvedValue({});
  sdeMock.loadReprocessing.mockResolvedValue({});
  skillsMock.loadCorrectedSkills.mockResolvedValue({ trained: new Map() });
  typeNamesMock.loadTypeNames.mockResolvedValue(new Map());
  systemSecurityMock.loadSystemNameAndSecurity.mockResolvedValue({
    name: 'Jita',
    security: 0.9,
  });
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
});
