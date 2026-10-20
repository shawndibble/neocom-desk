import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import type { AttributeDictionary } from '@/sde/marketTypes';

/** The SDE attribute dictionary; null while it loads or if it fails. */
export function useAttributeDictionary(): AttributeDictionary | null {
  return useAsyncLoad(loadAttributeDictionary).data ?? null;
}
