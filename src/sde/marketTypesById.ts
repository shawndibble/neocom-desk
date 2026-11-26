import { loadMarketTypes } from './loadMarketSde';
import type { MarketTypeEntry } from './marketTypes';
import { memoizeAsync } from '@/lib/memoizeAsync';

export const loadMarketTypesById = memoizeAsync(
  async (): Promise<ReadonlyMap<number, MarketTypeEntry>> => {
    const map = new Map<number, MarketTypeEntry>();
    for (const entry of await loadMarketTypes()) map.set(entry.typeId, entry);
    return map;
  }
);

export function clearMarketTypeIndex(): void {
  loadMarketTypesById.reset();
}
