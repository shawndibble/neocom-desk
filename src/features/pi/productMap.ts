import type { PiData } from '@/sde/types';

/**
 * ESI's schematic id to the product typeID `PiData.schematics` is keyed by.
 *
 * A factory pin reports which *schematic* it runs; every question worth asking
 * about it — what it makes, what it eats, which facility runs it — is keyed by
 * the *product*. The two directions were being rebuilt independently in
 * `stopTierModel` and `factoryBalanceModel`, and a map built twice is a map
 * that can disagree with itself.
 */
export function productBySchematicId(pi: PiData): Map<number, number> {
  return new Map(
    Object.entries(pi.schematics).map(([typeId, schematic]) => [
      schematic.schematicId,
      Number(typeId),
    ])
  );
}
