import type { PiData } from '@/sde/types';

export function productBySchematicId(pi: PiData): Map<number, number> {
  return new Map(
    Object.entries(pi.schematics).map(([typeId, schematic]) => [
      schematic.schematicId,
      Number(typeId),
    ])
  );
}
