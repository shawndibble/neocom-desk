import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { contractItemsCacheKey } from '@/features/character/contractItems';
import { readCachedContractStock } from './cachedContractStock';

const CHAR = 91000001;
const contract = (id: number, over: Record<string, unknown> = {}) => ({
  contract_id: id,
  issuer_id: CHAR,
  type: 'item_exchange',
  status: 'outstanding',
  for_corporation: false,
  ...over,
});

describe('readCachedContractStock', () => {
  beforeEach(async () => {
    await db.esiCache.clear();
    await db.esiCacheMeta.clear();
  });

  it('pairs outstanding item exchange contracts with their cached items, and skips the unread', async () => {
    await db.esiCache.bulkPut([
      {
        characterId: CHAR,
        key: 'contracts',
        value: [
          contract(1),
          contract(2),
          contract(3, { status: 'finished' }),
          contract(4, { type: 'courier' }),
        ],
        fetchedAt: 1,
      },
      {
        characterId: CHAR,
        key: contractItemsCacheKey(1),
        value: [{ record_id: 1, type_id: 34, quantity: 5, is_included: true }],
        fetchedAt: 1,
      },
    ]);
    const result = await readCachedContractStock([CHAR]);
    expect(result.map((entry) => entry.contract.contract_id)).toEqual([1]);
    expect(result[0].items).toHaveLength(1);
  });

  it('is empty when no contract list was ever cached', async () => {
    expect(await readCachedContractStock([CHAR])).toEqual([]);
  });
});
