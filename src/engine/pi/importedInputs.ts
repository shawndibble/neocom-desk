/**
 * What a colony's factories eat that nothing on the colony supplies: the
 * "brought in" line of the Colonies card. Judged from pin configuration alone
 * (an extractor's product, a factory's schematic), never from measured rates,
 * so an extractor with an unknown rate still counts as local supply. Pure.
 */
import type { PlanetPin } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { pinRole, factorySchematicId } from '@/engine/pi/colonyPins';
import { rawById } from '@/engine/pi/rawIndex';
import { DAY_MS } from '@/lib/age';

export interface ImportedInput {
  typeId: number;
  name: string;
  unitsPerDay: number;
  /** Null when the input's volume is not in the data. */
  m3PerDay: number | null;
  /** Built factory pins running a schematic that eats this input. */
  factories: number;
}

export function importedInputs(pins: readonly PlanetPin[], pi: PiData): ImportedInput[] {
  const bySchematicId = new Map(
    Object.entries(pi.schematics).map(([typeId, schematic]) => [
      schematic.schematicId,
      { typeId: Number(typeId), schematic },
    ])
  );
  const local = new Set<number>();
  const factoryCounts = new Map<number, number>();
  for (const pin of pins) {
    const role = pinRole(pin);
    if (role === 'extractor') {
      const product = pin.extractor_details?.product_type_id;
      if (product !== undefined) local.add(product);
    } else if (role === 'factory') {
      const schematicId = factorySchematicId(pin);
      const known = schematicId === undefined ? undefined : bySchematicId.get(schematicId);
      if (!known) continue;
      local.add(known.typeId);
      factoryCounts.set(known.typeId, (factoryCounts.get(known.typeId) ?? 0) + 1);
    }
  }

  const totals = new Map<number, ImportedInput>();
  for (const [productTypeId, count] of factoryCounts) {
    const { cycleTime, inputs } = pi.schematics[String(productTypeId)]!;
    for (const input of inputs) {
      if (local.has(input.typeID)) continue;
      const volume =
        pi.schematics[String(input.typeID)]?.volume ?? rawById(pi).get(input.typeID)?.volume;
      const unitsPerDay = count * input.quantity * (DAY_MS / 1000 / cycleTime);
      const line = totals.get(input.typeID) ?? {
        typeId: input.typeID,
        name: input.name,
        unitsPerDay: 0,
        m3PerDay: volume === undefined ? null : 0,
        factories: 0,
      };
      line.unitsPerDay += unitsPerDay;
      if (line.m3PerDay !== null && volume !== undefined) line.m3PerDay += unitsPerDay * volume;
      line.factories += count;
      totals.set(input.typeID, line);
    }
  }
  return [...totals.values()].sort(
    (a, b) => (b.m3PerDay ?? 0) - (a.m3PerDay ?? 0) || a.typeId - b.typeId
  );
}
