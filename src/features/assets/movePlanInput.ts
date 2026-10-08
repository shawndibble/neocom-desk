import type { ConsolidationCharacter } from '@/engine/assets/consolidation';
import type { CargoHold } from '@/engine/market/cargoHolds';
import type { CharacterAsset } from '@/esi/endpoints';

export interface MovePlanSource {
  characterId: number;
  name: string;
  assets: readonly CharacterAsset[];
}

/** One checkbox row of the picker: loose stock of a type at one pickup location, or an assembled ship. */
export interface PickerStack {
  key: string;
  characterId: number;
  locationId: number;
  locationType: CharacterAsset['location_type'];
  typeId: number;
  quantity: number;
  ship: boolean;
}

function stackKey(a: CharacterAsset, characterId: number, ship: boolean): string {
  return `${characterId}:${a.location_id}:${a.type_id}:${ship ? 'ship' : 'loose'}`;
}

/** What can be moved: hangar stock and assembled ships; items inside containers or ships are left out. */
function movable(a: CharacterAsset, shipTypeIds: ReadonlySet<number>): 'ship' | 'loose' | null {
  if (a.location_type === 'item' || a.location_type === 'solar_system') return null;
  if (a.is_singleton) return shipTypeIds.has(a.type_id) ? 'ship' : null;
  return 'loose';
}

export function pickerStacks(
  sources: readonly MovePlanSource[],
  shipTypeIds: ReadonlySet<number>
): PickerStack[] {
  const stacks = new Map<string, PickerStack>();
  for (const { characterId, assets } of sources) {
    for (const a of assets) {
      const kind = movable(a, shipTypeIds);
      if (!kind) continue;
      const key = stackKey(a, characterId, kind === 'ship');
      const existing = stacks.get(key);
      if (existing) existing.quantity += a.quantity;
      else
        stacks.set(key, {
          key,
          characterId,
          locationId: a.location_id,
          locationType: a.location_type,
          typeId: a.type_id,
          quantity: a.quantity,
          ship: kind === 'ship',
        });
    }
  }
  return [...stacks.values()];
}

/** The engine's input: only the assets the user ticked, per Character. */
export function selectedPlanCharacters(
  sources: readonly MovePlanSource[],
  shipTypeIds: ReadonlySet<number>,
  selected: ReadonlySet<string>
): ConsolidationCharacter[] {
  const out: ConsolidationCharacter[] = [];
  for (const { characterId, name, assets } of sources) {
    const picked = assets.flatMap((a) => {
      const kind = movable(a, shipTypeIds);
      if (!kind || !selected.has(stackKey(a, characterId, kind === 'ship'))) return [];
      return [
        {
          itemId: a.item_id,
          typeId: a.type_id,
          quantity: a.quantity,
          locationId: a.location_id,
          locationType: a.location_type,
          isSingleton: a.is_singleton ?? false,
        },
      ];
    });
    if (picked.length > 0) out.push({ characterId, name, assets: picked });
  }
  return out;
}

/** A hauler's hold for volume math: the general hold, else everything it can carry. */
export function holdCapacityM3(holds: readonly CargoHold[]): number | null {
  const general = holds.filter((h) => h.kind === 'general').reduce((s, h) => s + h.capacityM3, 0);
  if (general > 0) return general;
  const total = holds.reduce((s, h) => s + h.capacityM3, 0);
  return total > 0 ? total : null;
}
