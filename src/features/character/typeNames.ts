/**
 * Item type name lookups for Character views (wallet transactions, assets,
 * orders): resolved from the local SDE snapshot (public/data/types.json),
 * never ESI — types.json already covers every marketable/ownable item.
 * Falls back to "Type #id" for anything missing from the snapshot.
 */
import { loadTypes } from '@/sde/loadSde';

/** Type name for one typeID, or the "Type #id" fallback. */
export async function loadTypeName(typeId: number): Promise<string> {
  const types = await loadTypes();
  return types[String(typeId)]?.name ?? `Type #${typeId}`;
}

/** Type names for many typeIDs at once, keyed by typeID. */
export async function loadTypeNames(typeIds: readonly number[]): Promise<Map<number, string>> {
  const types = await loadTypes();
  const map = new Map<number, string>();
  for (const id of typeIds) {
    map.set(id, types[String(id)]?.name ?? `Type #${id}`);
  }
  return map;
}
