import { db } from '@/db';
import type { CharacterAsset } from '@/esi/endpoints';
import { readCachedRows } from '@/esi/cache';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { KEY } from './assets';

export async function loadCachedAssetLists(): Promise<CharacterAsset[][]> {
  const ids = await db.characters.toCollection().primaryKeys();
  const rows = await readCachedRows<CharacterAsset[]>(ids, KEY);
  return [...rows.values()].map((row) => row.data);
}

export function useCachedAssetLists(enabled: boolean): readonly CharacterAsset[][] | null {
  const { status, data } = useKeyedLoad(enabled ? 'cached-assets' : null, loadCachedAssetLists);
  return status === 'ready' ? data : null;
}
