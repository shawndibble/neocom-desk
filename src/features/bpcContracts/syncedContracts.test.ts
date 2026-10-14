/**
 * `fetchSnapshot`'s own read path, not just `bpcRowsFromContractOffers`'s
 * pure narrowing (issue #1076): the fix here is specifically that raw rows
 * from every chunk doc are accumulated *before* `bpcRowsFromContractOffers`
 * runs, so a contract whose lines straddle a chunk boundary is still tallied
 * as one contract. A pure-function test of `bpcRowsFromContractOffers` alone
 * cannot exercise that — it always hands the function one complete array —
 * so this file mocks the Firestore read the same way
 * `contractSearch/chunkedSnapshot.test.ts` does and asserts across chunk
 * boundaries directly.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { resetRevalidationState, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { loadPublicBpcContracts } from './syncedContracts';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';

const getDocs = vi.hoisted(() => vi.fn());
const getDoc = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore/lite', () => ({
  getDocs,
  getDoc,
  doc: (_db: unknown, collectionName: string, id: string) => ({ path: `${collectionName}/${id}` }),
  collection: (_db: unknown, name: string) => ({ name }),
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureAnySession: vi.fn(async () => undefined) }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));

const CHARACTER_ID = 91;

function snapshotDocs(
  lastSyncedAt: number,
  chunks: readonly (readonly PublicContractOfferRow[])[]
) {
  return {
    docs: [
      { id: 'meta', data: () => ({ lastSyncedAt }) },
      ...chunks.map((rows, i) => ({
        id: `chunk-${String(i).padStart(4, '0')}`,
        data: () => ({ rows }),
      })),
    ],
  };
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
  getDocs.mockReset();
  getDoc.mockReset();
});

describe('loadPublicBpcContracts', () => {
  it('narrows every chunk to blueprint copies', async () => {
    getDocs.mockResolvedValue(snapshotDocs(1_700_000_000_000, [[copyLine()]]));

    const result = await loadPublicBpcContracts(CHARACTER_ID);

    expect(result?.data.rows).toEqual([expect.objectContaining({ typeId: 32858 })]);
    expect(result?.data.lastSyncedAt).toBe(1_700_000_000_000);
  });

  it('carries blueprint originals separately from the copies (issue #1240)', async () => {
    const original: PublicContractOfferRow = {
      ...copyLine({ contractId: 2 }),
      isBlueprintCopy: undefined,
      runs: undefined,
    };
    getDocs.mockResolvedValue(snapshotDocs(1_700_000_000_000, [[copyLine(), original]]));

    const result = await loadPublicBpcContracts(CHARACTER_ID);

    expect(result?.data.rows.map((row) => row.contractId)).toEqual([1]);
    expect(result?.data.originals).toEqual([
      expect.objectContaining({ contractId: 2, me: 10, te: 20, runs: -1 }),
    ]);
  });

  it('tallies a contract as multi-type even when its lines straddle a chunk boundary (issue #1076)', async () => {
    // One contract's two lines land in two different chunk docs — exactly
    // the case fixed-size chunking over a contract-then-type sorted array
    // can produce for a large enough contract. Narrowing per chunk (the old
    // behaviour) would see each half alone and wrongly call it single-type.
    getDocs.mockResolvedValue(
      snapshotDocs(1, [
        [copyLine({ contractId: 1, typeId: 638 })],
        [{ ...copyLine({ contractId: 1, typeId: 621 }), isBlueprintCopy: undefined }],
      ])
    );

    const result = await loadPublicBpcContracts(CHARACTER_ID);

    expect(result?.data.rows).toEqual([
      expect.objectContaining({ contractId: 1, typeId: 638, isMultiType: true }),
    ]);
  });

  it('keeps two different contracts’ tallies independent across chunks', async () => {
    getDocs.mockResolvedValue(
      snapshotDocs(1, [
        [copyLine({ contractId: 1, typeId: 638 })],
        [copyLine({ contractId: 2, typeId: 870 })],
      ])
    );

    const result = await loadPublicBpcContracts(CHARACTER_ID);

    expect(result?.data.rows).toEqual([
      expect.objectContaining({ contractId: 1, isMultiType: false }),
      expect.objectContaining({ contractId: 2, isMultiType: false }),
    ]);
  });
});

describe('loadPublicBpcContracts when the cached snapshot lapsed', () => {
  async function seedLapsed(lastSyncedAt: number): Promise<void> {
    await db.esiCache.put({
      characterId: GLOBAL_CACHE_CHARACTER_ID,
      key: 'publicContractOffers',
      value: { rows: [], originals: [], lastSyncedAt, marker: 'cached' },
      fetchedAt: Date.now() - 31 * 60_000,
    });
  }

  it('costs one meta read and no collection read when lastSyncedAt is unchanged', async () => {
    await seedLapsed(5);
    getDoc.mockResolvedValue({ data: () => ({ lastSyncedAt: 5 }) });

    const result = await loadPublicBpcContracts(CHARACTER_ID);

    expect(result?.data).toMatchObject({ marker: 'cached' });
    expect(getDoc).toHaveBeenCalledTimes(1);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('does the full read when lastSyncedAt changed', async () => {
    await seedLapsed(5);
    getDoc.mockResolvedValue({ data: () => ({ lastSyncedAt: 6 }) });
    getDocs.mockResolvedValue(snapshotDocs(6, [[copyLine()]]));

    const result = await loadPublicBpcContracts(CHARACTER_ID);

    expect(result?.data.lastSyncedAt).toBe(6);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('does the full read when nothing is cached', async () => {
    getDocs.mockResolvedValue(snapshotDocs(6, [[copyLine()]]));

    await loadPublicBpcContracts(CHARACTER_ID);

    expect(getDoc).not.toHaveBeenCalled();
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('falls back to the full read when the meta check fails', async () => {
    await seedLapsed(5);
    getDoc.mockRejectedValue(new Error('offline'));
    getDocs.mockResolvedValue(snapshotDocs(5, [[copyLine()]]));

    const result = await loadPublicBpcContracts(CHARACTER_ID);

    expect(result?.data.rows).toHaveLength(1);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });
});
