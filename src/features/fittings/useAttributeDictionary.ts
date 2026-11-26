import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import type { AttributeDictionary } from '@/sde/marketTypes';

export function useAttributeDictionary(): AttributeDictionary | null {
  return useAsyncLoad(loadAttributeDictionary).data ?? null;
}
