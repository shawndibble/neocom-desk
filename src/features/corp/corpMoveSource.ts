/**
 * The corporation's movable stock, in the shape the Move plan reads (issue #5167).
 *
 * Corp stock sits in an office: an `OfficeFolder` asset at a station or structure,
 * with each hangar item pointing at the folder's item id and flagged `CorpSAGn`.
 * The Move plan wants a pilot's shape instead (the item at the station, flag
 * `Hangar`), so each top-level hangar item is lifted to its office's station or
 * structure. Items in space, deliveries, impounded and asset-safety states, and
 * anything inside a container, are left out, as on the personal tab.
 *
 * Pure: types only, no fetch/DOM/Dexie.
 */
import type { CorpAssetInput } from '@/engine/corp/assetDivisions';
import type { CharacterAsset } from '@/esi/endpoints';

const HANGAR_FLAG = /^CorpSAG[1-7]$/;

export function corpMoveAssets(inputs: readonly CorpAssetInput[]): CharacterAsset[] {
  const byItemId = new Map(inputs.map((input) => [input.itemId, input]));
  const out: CharacterAsset[] = [];
  /** Top-level hangar items kept, so a ship's fitted rigs can be counted. */
  const kept = new Set<number>();
  for (const input of inputs) {
    if (!HANGAR_FLAG.test(input.locationFlag)) continue;
    const office = byItemId.get(input.locationId);
    if (office?.locationFlag !== 'OfficeFolder') continue;
    if (office.locationType !== 'station' && office.locationType !== 'other') continue;
    kept.add(input.itemId);
    out.push({
      item_id: input.itemId,
      type_id: input.typeId,
      quantity: input.quantity,
      location_id: office.locationId,
      location_type: office.locationType,
      location_flag: 'Hangar',
      is_singleton: input.isSingleton ?? false,
    });
  }
  for (const input of inputs) {
    if (input.locationType !== 'item' || !input.locationFlag.startsWith('RigSlot')) continue;
    if (!kept.has(input.locationId)) continue;
    out.push({
      item_id: input.itemId,
      type_id: input.typeId,
      quantity: input.quantity,
      location_id: input.locationId,
      location_type: 'item',
      location_flag: input.locationFlag,
      is_singleton: input.isSingleton ?? false,
    });
  }
  return out;
}
