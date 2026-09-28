import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MarketTypeEntry } from './marketTypes';

const TYPES: MarketTypeEntry[] = [
  { typeId: 34, name: 'Tritanium', marketGroupId: 18 },
  { typeId: 2048, name: 'Damage Control II', marketGroupId: 300 },
];

const loadMarketTypes = vi.fn(async (): Promise<MarketTypeEntry[]> => TYPES);
vi.mock('./loadMarketSde', () => ({
  loadMarketTypes: () => loadMarketTypes(),
}));

import { clearMarketTypeIndex, loadMarketTypesById } from './marketTypesById';

beforeEach(() => {
  clearMarketTypeIndex();
  loadMarketTypes.mockReset();
  loadMarketTypes.mockResolvedValue(TYPES);
});

describe('loadMarketTypesById', () => {
  it('keys the catalogue by type id', async () => {
    const byId = await loadMarketTypesById();

    expect(byId.get(34)?.name).toBe('Tritanium');
    expect(byId.get(2048)?.name).toBe('Damage Control II');
    expect(byId.get(1)).toBeUndefined();
  });

  it('indexes the catalogue once, however many callers ask', async () => {
    const [a, b] = await Promise.all([loadMarketTypesById(), loadMarketTypesById()]);
    const c = await loadMarketTypesById();

    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(loadMarketTypes).toHaveBeenCalledTimes(1);
  });

  it('rejects when the catalogue cannot be read, then retries instead of memoizing the failure', async () => {
    loadMarketTypes.mockRejectedValueOnce(new Error('offline'));
    await expect(loadMarketTypesById()).rejects.toThrow('offline');

    expect((await loadMarketTypesById()).get(34)?.name).toBe('Tritanium');
    expect(loadMarketTypes).toHaveBeenCalledTimes(2);
  });
});
