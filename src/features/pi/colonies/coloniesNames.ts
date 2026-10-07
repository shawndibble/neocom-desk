import type { PiData } from '@/sde/types';

/**
 * Names for every P0 and every produced item, straight from pi.json: the same
 * source Plan reads, so Colonies never shows "Type #2267" for a known type or
 * "Unknown product" for a schematic's output.
 */
export function piTypeNames(pi: PiData | null): ReadonlyMap<number, string> {
  const names = new Map<number, string>();
  if (!pi) return names;
  for (const resource of pi.raw) names.set(resource.typeID, resource.name);
  for (const [typeId, schematic] of Object.entries(pi.schematics)) {
    names.set(Number(typeId), schematic.name);
  }
  return names;
}
