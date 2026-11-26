import type { CorpAssetInput } from '@/engine/corp/assetDivisions';
import type { CharacterAsset } from '@/esi/endpoints';
import { isNpcStationId, UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';

const HANGAR_FLAG = /^CorpSAG[1-7]$/;

function locationTypeOfPlace(id: number): 'station' | 'other' | null {
  if (isNpcStationId(id)) return 'station';
  return id >= UPWELL_STRUCTURE_ID_FLOOR ? 'other' : null;
}

export function corpMoveAssets(inputs: readonly CorpAssetInput[]): CharacterAsset[] {
  const byItemId = new Map(inputs.map((input) => [input.itemId, input]));
  const out: CharacterAsset[] = [];
  const kept = new Set<number>();
  for (const input of inputs) {
    if (!HANGAR_FLAG.test(input.locationFlag)) continue;
    const office = byItemId.get(input.locationId);
    if (office?.locationFlag !== 'OfficeFolder') continue;
    const locationType = locationTypeOfPlace(office.locationId);
    if (locationType === null) continue;
    kept.add(input.itemId);
    out.push({
      item_id: input.itemId,
      type_id: input.typeId,
      quantity: input.quantity,
      location_id: office.locationId,
      location_type: locationType,
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
