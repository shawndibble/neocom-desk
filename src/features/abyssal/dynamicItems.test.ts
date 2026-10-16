import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { EsiError } from '@/esi/errors';
import type { DynamicItem } from '@/esi/endpoints';
import { mutaplasmidLookup } from '@/engine/fittings/mutaplasmids';

const getDogmaDynamicItem = vi.fn();
vi.mock('@/esi/endpoints', () => ({
  getDogmaDynamicItem: (...args: unknown[]) => getDogmaDynamicItem(...args),
}));

const { fetchDynamicItems, getDynamicItem, mutationsForItems, resetDynamicItemFailuresForTests } =
  await import('./dynamicItems');

const NEUT = 47832;

function answer(itemId: number): { data: DynamicItem } {
  return {
    data: {
      created_by: 2123627600,
      source_type_id: 16475,
      mutator_type_id: 47831,
      dogma_attributes: [
        { attribute_id: 6, value: 400 + (itemId % 100) },
        { attribute_id: 9, value: 40 },
      ],
      dogma_effects: [],
    },
  };
}

beforeEach(async () => {
  await db.dynamicItems.clear();
  getDogmaDynamicItem.mockReset();
  resetDynamicItemFailuresForTests();
});

describe('getDynamicItem', () => {
  it('fetches once, then answers from Dexie for good', async () => {
    getDogmaDynamicItem.mockImplementation(async (_t: number, id: number) => answer(id));

    const first = await getDynamicItem({ typeId: NEUT, itemId: 1001 });
    const second = await getDynamicItem({ typeId: NEUT, itemId: 1001 });

    expect(getDogmaDynamicItem).toHaveBeenCalledTimes(1);
    expect(getDogmaDynamicItem).toHaveBeenCalledWith(NEUT, 1001, {});
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      itemId: 1001,
      typeId: NEUT,
      sourceTypeId: 16475,
      mutatorTypeId: 47831,
      createdBy: 2123627600,
      attributes: [
        [6, 401],
        [9, 40],
      ],
    });
    expect(await db.dynamicItems.get(1001)).toEqual(first);
  });

  it('remembers an id ESI rejected, and never spends the error limit on it twice', async () => {
    getDogmaDynamicItem.mockRejectedValue(new EsiError(400, 'Invalid item ID'));

    expect(await getDynamicItem({ typeId: NEUT, itemId: 7 })).toBeNull();
    expect(await getDynamicItem({ typeId: NEUT, itemId: 7 })).toBeNull();
    expect(getDogmaDynamicItem).toHaveBeenCalledTimes(1);
  });

  it('tries again later after a failure that was not the id’s fault', async () => {
    getDogmaDynamicItem.mockRejectedValueOnce(new EsiError(503, 'down'));
    getDogmaDynamicItem.mockImplementation(async (_t: number, id: number) => answer(id));

    expect(await getDynamicItem({ typeId: NEUT, itemId: 8 })).toBeNull();
    expect(await getDynamicItem({ typeId: NEUT, itemId: 8 })).not.toBeNull();
  });
});

describe('fetchDynamicItems', () => {
  it('reads cached rows, asks ESI once per missing id, and never more than the concurrency at once', async () => {
    await db.dynamicItems.put({
      itemId: 1,
      typeId: NEUT,
      createdBy: 1,
      sourceTypeId: 16475,
      mutatorTypeId: 47831,
      attributes: [],
      savedAt: 0,
    });
    let inFlight = 0;
    let peak = 0;
    getDogmaDynamicItem.mockImplementation(async (_t: number, id: number) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return answer(id);
    });
    const refs = [1, 2, 3, 4, 5, 6, 2, 3].map((itemId) => ({ typeId: NEUT, itemId }));

    const items = await fetchDynamicItems(refs, { concurrency: 2 });

    expect([...items.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getDogmaDynamicItem).toHaveBeenCalledTimes(5);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('leaves a failed id out rather than failing the batch', async () => {
    getDogmaDynamicItem.mockImplementation(async (_t: number, id: number) => {
      if (id === 2) throw new EsiError(400, 'Invalid item ID');
      return answer(id);
    });

    const items = await fetchDynamicItems([
      { typeId: NEUT, itemId: 1 },
      { typeId: NEUT, itemId: 2 },
    ]);

    expect([...items.keys()]).toEqual([1]);
  });

  it('stops on abort', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchDynamicItems([{ typeId: NEUT, itemId: 1 }], { signal: controller.signal })
    ).rejects.toThrow();
    expect(getDogmaDynamicItem).not.toHaveBeenCalled();
  });
});

describe('mutationsForItems', () => {
  it('turns each fetched item into its mutation, rolls filtered to the mutaplasmid’s own', async () => {
    getDogmaDynamicItem.mockImplementation(async (_t: number, id: number) => answer(id));
    const lookup = mutaplasmidLookup({
      attributeNames: { 6: 'capacitorNeed' },
      mutaplasmids: {
        47831: {
          result: NEUT,
          bases: [16475],
          attributes: [{ id: 6, min: 0.8, max: 1.3, highIsGood: false }],
        },
      },
      abyssalTypeIds: [NEUT],
    });

    const mutations = await mutationsForItems([{ typeId: NEUT, itemId: 1005 }], lookup);

    expect(mutations.get(1005)).toEqual({
      baseTypeId: 16475,
      mutaplasmidTypeId: 47831,
      attributes: { 6: 405 },
    });
  });
});
