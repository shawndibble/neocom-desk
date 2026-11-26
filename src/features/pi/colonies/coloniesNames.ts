import type { PiData } from '@/sde/types';

export function piTypeNames(pi: PiData | null): ReadonlyMap<number, string> {
  const names = new Map<number, string>();
  if (!pi) return names;
  for (const resource of pi.raw) names.set(resource.typeID, resource.name);
  for (const [typeId, schematic] of Object.entries(pi.schematics)) {
    names.set(Number(typeId), schematic.name);
  }
  return names;
}
