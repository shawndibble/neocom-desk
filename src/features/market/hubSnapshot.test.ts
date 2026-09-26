import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { resetRevalidationState } from '@/esi/cache';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { loadHubSnapshotRange } from './hubSnapshot';

const getDocs = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore/lite', () => ({
  getDocs,
  collection: (_db: unknown, name: string) => ({ name }),
  query: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  startAt: (...args: unknown[]) => args,
  endAt: (...args: unknown[]) => args,
  documentId: () => '__name__',
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn(async () => undefined) }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));

const CHARACTER_ID = 91;
const STATION_KEY = String(DEFAULT_TRADE_HUB.stationId);

function docsResult(byDate: Record<string, unknown>) {
  return { docs: Object.entries(byDate).map(([id, data]) => ({ id, data: () => data })) };
}

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
  getDocs.mockReset();
});

describe('loadHubSnapshotRange', () => {
  it('routes a fuzzwork-sourced day to saved, reading only the default hub', async () => {
    getDocs.mockResolvedValue(
      docsResult({
        '2026-09-24': {
          source: 'fuzzwork',
          hubs: {
            [STATION_KEY]: { '34': { buy: 3.6, sell: 3.8 } },
            '60008494': { '34': { buy: 3.5, sell: 3.9 } }, // Amarr — not read
          },
        },
      })
    );

    const result = await loadHubSnapshotRange(CHARACTER_ID, '2026-09-24', '2026-09-24');

    expect(result.saved.get('2026-09-24')?.get(34)).toEqual({ buy: 3.6, sell: 3.8 });
    expect(result.historical.size).toBe(0);
  });

  it('routes an adam4eve-sourced day to historical', async () => {
    getDocs.mockResolvedValue(
      docsResult({
        '2026-06-28': {
          source: 'adam4eve',
          hubs: { [STATION_KEY]: { '62454': { buy: 933.1, sell: 1141 } } },
        },
      })
    );

    const result = await loadHubSnapshotRange(CHARACTER_ID, '2026-06-28', '2026-06-28');

    expect(result.historical.get('2026-06-28')?.get(62454)).toEqual({ buy: 933.1, sell: 1141 });
    expect(result.saved.size).toBe(0);
  });

  it('splits a range across both sources by day', async () => {
    getDocs.mockResolvedValue(
      docsResult({
        '2026-06-28': {
          source: 'adam4eve',
          hubs: { [STATION_KEY]: { '34': { buy: 1, sell: 2 } } },
        },
        '2026-09-24': {
          source: 'fuzzwork',
          hubs: { [STATION_KEY]: { '34': { buy: 3, sell: 4 } } },
        },
      })
    );

    const result = await loadHubSnapshotRange(CHARACTER_ID, '2026-06-28', '2026-09-24');

    expect(result.historical.get('2026-06-28')?.get(34)).toEqual({ buy: 1, sell: 2 });
    expect(result.saved.get('2026-09-24')?.get(34)).toEqual({ buy: 3, sell: 4 });
  });

  it('is empty for a doc missing the default hub or with no source tag', async () => {
    getDocs.mockResolvedValue(
      docsResult({
        '2026-09-24': { source: 'fuzzwork', hubs: { '60008494': { '34': { buy: 1, sell: 2 } } } },
        '2026-09-23': { hubs: { [STATION_KEY]: { '34': { buy: 1, sell: 2 } } } },
      })
    );

    const result = await loadHubSnapshotRange(CHARACTER_ID, '2026-09-23', '2026-09-24');

    expect(result.saved.size).toBe(0);
    expect(result.historical.size).toBe(0);
  });

  it('reads a non-default hub when one is passed', async () => {
    const amarr = getTradeHub('amarr')!;
    getDocs.mockResolvedValue(
      docsResult({
        '2026-09-24': {
          source: 'fuzzwork',
          hubs: {
            [STATION_KEY]: { '34': { buy: 3.6, sell: 3.8 } }, // Jita — not read
            [String(amarr.stationId)]: { '34': { buy: 3.4, sell: 3.7 } },
          },
        },
      })
    );

    const result = await loadHubSnapshotRange(CHARACTER_ID, '2026-09-24', '2026-09-24', amarr);

    expect(result.saved.get('2026-09-24')?.get(34)).toEqual({ buy: 3.4, sell: 3.7 });
  });

  it('is empty without hitting Firestore when the range is backwards', async () => {
    const result = await loadHubSnapshotRange(CHARACTER_ID, '2026-09-24', '2026-09-01');

    expect(result).toEqual({ saved: new Map(), historical: new Map() });
    expect(getDocs).not.toHaveBeenCalled();
  });
});
