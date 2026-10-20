import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAbyssalContractValue } from './contractAbyssalValue';

const mutamarket = vi.hoisted(() => ({ getAbyssalEstimate: vi.fn() }));
vi.mock('@/market/mutamarket', () => mutamarket);

const NEUT = 47832;
const estimate = (value: number | null) => ({
  status: value === null ? 'no-estimate' : 'priced',
  value,
  source: 'mutamarket',
  fetchedAt: 0,
  valueUpdatedAt: null,
  url: 'https://mutamarket.com',
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadAbyssalContractValue', () => {
  it('prices each abyssal module by its own estimate', async () => {
    mutamarket.getAbyssalEstimate.mockImplementation(async (_type: number, itemId: number) =>
      estimate(itemId === 11 ? 90_000_000 : null)
    );
    const result = await loadAbyssalContractValue(
      [{ type_id: NEUT, item_id: 11 }, { type_id: NEUT, item_id: 12 }, { type_id: NEUT }],
      { characterId: 7 }
    );
    expect(result).toEqual({ estimated: 90_000_000, priced: 1, unpriced: 2 });
    expect(mutamarket.getAbyssalEstimate).toHaveBeenCalledTimes(2);
    expect(mutamarket.getAbyssalEstimate).toHaveBeenCalledWith(NEUT, 11, { characterId: 7 });
  });

  it('leaves abyssal lines unpriced without an item id or a Character', async () => {
    const result = await loadAbyssalContractValue([{ type_id: NEUT, item_id: 11 }], {
      characterId: null,
    });
    expect(result).toEqual({ estimated: 0, priced: 0, unpriced: 1 });
    expect(mutamarket.getAbyssalEstimate).not.toHaveBeenCalled();
  });

  it('stops looking up once MutaMarket is unavailable', async () => {
    mutamarket.getAbyssalEstimate.mockResolvedValue({ ...estimate(null), status: 'unavailable' });
    const lines = Array.from({ length: 12 }, (_, i) => ({ type_id: NEUT, item_id: 100 + i }));
    const result = await loadAbyssalContractValue(lines, { characterId: 7 });
    expect(mutamarket.getAbyssalEstimate.mock.calls.length).toBeLessThanOrEqual(4);
    expect(result).toEqual({ estimated: 0, priced: 0, unpriced: 12 });
  });

  it('starts no lookup once the view is closed', async () => {
    const result = await loadAbyssalContractValue([{ type_id: NEUT, item_id: 11 }], {
      characterId: 7,
      isCancelled: () => true,
    });
    expect(mutamarket.getAbyssalEstimate).not.toHaveBeenCalled();
    expect(result.unpriced).toBe(1);
  });
});
