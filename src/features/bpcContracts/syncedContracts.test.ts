/**
 * `loadPublicBpcContracts`' read path from R2 (ADR 0019): which objects it
 * reads, how it narrows them, and that R2 being unreachable reads as
 * unavailable rather than falling back to Firestore (issue #4270).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import { resetRevalidationState, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { loadPublicBpcContracts } from './syncedContracts';
import { resetR2ObjectMemo } from '@/features/contractSearch/r2OfferSnapshot';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';

const getDocs = vi.hoisted(() => vi.fn());
const getDoc = vi.hoisted(() => vi.fn());

// R2 is the only store: these spies prove nothing reaches Firestore.
vi.mock('firebase/firestore/lite', () => ({
  getDocs,
  getDoc,
  doc: vi.fn(),
  collection: vi.fn(),
}));

vi.mock('@/sde/loadSde', () => ({ loadBlueprints: async () => ({ '32858': {}, '32859': {} }) }));

const ORIGIN = 'https://data.neocomdesk.com';
const INDEX_URL = `${ORIGIN}/contract-offers/index.json`;
const objectName = (typeId: number) => `contract-offers/types/${typeId}.hash.json`;

function r2Index(lastSyncedAt: number) {
  return {
    lastSyncedAt,
    types: {
      '32858': { count: 1, cheapest: 1, objects: [objectName(32858)] },
      '32859': { count: 1, cheapest: 1, objects: [objectName(32859)] },
      // Not a blueprint: must never be downloaded.
      '34': { count: 9, cheapest: 1, objects: [objectName(34)] },
    },
    regionIds: [10000002],
  };
}

/** Serves the index and each blueprint type's object; anything else is a 404. */
function serveR2(index: unknown, byType: Record<number, PublicContractOfferRow[]> = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === INDEX_URL) return new Response(JSON.stringify(index), { status: 200 });
    for (const [typeId, lines] of Object.entries(byType)) {
      if (url === `${ORIGIN}/${objectName(Number(typeId))}`) {
        return new Response(JSON.stringify(lines), { status: 200 });
      }
    }
    return new Response('missing', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function copyLine(overrides: Partial<PublicContractOfferRow> = {}): PublicContractOfferRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: 32858,
    price: 37_000_000,
    isAuction: false,
    quantity: 1,
    isBlueprintCopy: true,
    me: 10,
    te: 20,
    runs: 3,
    dateExpired: Date.parse('2026-09-09T18:00:00Z'),
    ...overrides,
  };
}

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
  resetR2ObjectMemo();
  getDocs.mockReset();
  getDoc.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadPublicBpcContracts', () => {
  it('reads only the blueprint types the index lists', async () => {
    const fetchMock = serveR2(r2Index(50), { 32858: [copyLine()], 32859: [] });

    const result = await loadPublicBpcContracts();

    expect(result?.data.rows).toEqual([expect.objectContaining({ typeId: 32858 })]);
    expect(result?.data.lastSyncedAt).toBe(50);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toContain(`${ORIGIN}/${objectName(32858)}`);
    expect(urls).not.toContain(`${ORIGIN}/${objectName(34)}`);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('carries blueprint originals separately from the copies (issue #1240)', async () => {
    const original: PublicContractOfferRow = {
      ...copyLine({ contractId: 2 }),
      isBlueprintCopy: undefined,
      runs: undefined,
    };
    serveR2(r2Index(50), { 32858: [copyLine(), original], 32859: [] });

    const result = await loadPublicBpcContracts();

    expect(result?.data.rows.map((row) => row.contractId)).toEqual([1]);
    expect(result?.data.originals).toEqual([
      expect.objectContaining({ contractId: 2, me: 10, te: 20, runs: -1 }),
    ]);
  });

  it('tallies a bundle of two blueprint types as multi-type across their objects (issue #1076)', async () => {
    serveR2(r2Index(50), {
      32858: [copyLine({ contractId: 1, typeId: 32858 })],
      32859: [
        copyLine({ contractId: 1, typeId: 32859 }),
        copyLine({ contractId: 2, typeId: 32859 }),
      ],
    });

    const result = await loadPublicBpcContracts();

    expect(result?.data.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contractId: 1, isMultiType: true }),
        expect.objectContaining({ contractId: 2, isMultiType: false }),
      ])
    );
  });

  it('serves the cached snapshot when a lapsed one is still the published one', async () => {
    await db.esiCache.put({
      characterId: GLOBAL_CACHE_CHARACTER_ID,
      key: 'publicContractOffers',
      value: { rows: [], originals: [], lastSyncedAt: 50, marker: 'cached' },
      fetchedAt: Date.now() - 61 * 60_000,
    });
    const fetchMock = serveR2(r2Index(50));

    const result = await loadPublicBpcContracts();

    expect(result?.data).toMatchObject({ marker: 'cached' });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([INDEX_URL]);
  });

  it('reads as unavailable when R2 serves no usable index, with no Firestore fallback', async () => {
    serveR2({ nonsense: true });

    expect(await loadPublicBpcContracts()).toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('reads as unavailable when a named object cannot be read, with no Firestore fallback', async () => {
    serveR2(r2Index(50));

    expect(await loadPublicBpcContracts()).toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('reads as unavailable when R2 is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    expect(await loadPublicBpcContracts()).toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
  });
});
