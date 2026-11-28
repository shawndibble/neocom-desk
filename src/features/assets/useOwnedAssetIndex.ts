import { db } from '@/db';
import type { CharacterAsset } from '@/esi/endpoints';
import { readCachedRows } from '@/esi/cache';
import { ownedAnywhere, ownedPlaces } from '@/engine/market/appraisalOwned';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { KEY } from './assets';

export interface OwnedAssetIndex {
  typeIds: ReadonlySet<number>;
  placeIds: ReadonlySet<number>;
}

let memo: { signature: string; index: Promise<OwnedAssetIndex> } | null = null;

async function buildIndex(ids: readonly number[]): Promise<OwnedAssetIndex> {
  const rows = await readCachedRows<CharacterAsset[]>(ids, KEY);
  const lists = [...rows.values()].map((row) => row.data);
  return {
    typeIds: new Set(ownedAnywhere(lists).keys()),
    placeIds: new Set(ownedPlaces(lists).map((place) => place.id)),
  };
}

export async function loadOwnedAssetIndex(): Promise<OwnedAssetIndex> {
  const ids = await db.characters.toCollection().primaryKeys();
  const metas = await db.esiCacheMeta.bulkGet(ids.map((id): [number, string] => [id, KEY]));
  const signature = metas.map((meta, i) => `${ids[i]}:${meta?.fetchedAt}:${meta?.etag}`).join();
  if (memo?.signature === signature) return memo.index;
  const index = buildIndex(ids);
  memo = { signature, index };
  index.catch(() => {
    if (memo?.index === index) memo = null;
  });
  return index;
}

export function useOwnedAssetIndex(enabled: boolean): OwnedAssetIndex | null {
  const { status, data } = useKeyedLoad(enabled ? 'owned-asset-index' : null, loadOwnedAssetIndex);
  return status === 'ready' ? data : null;
}
