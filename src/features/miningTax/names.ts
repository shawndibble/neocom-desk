/** Solar-system and ore-type name resolution for the Moon Mining Tax ledger (issue #523). */
import { loadSystemName } from '@/features/character/systemSecurity';
import { loadTypeNames } from '@/features/character/typeNames';
import type { MoonMiningTaxRow } from './snapshot';

export interface MiningTaxNames {
  systemNames: Map<number, string>;
  typeNames: Map<number, string>;
}

export async function resolveRowNames(rows: readonly MoonMiningTaxRow[]): Promise<MiningTaxNames> {
  const systemIds = [...new Set(rows.map((row) => row.entry.solarSystemId))];
  const typeIds = [
    ...new Set(rows.flatMap((row) => row.entry.oreLines.map((line) => line.typeId))),
  ];

  const [systemNamePairs, typeNames] = await Promise.all([
    Promise.all(
      systemIds.map(async (id): Promise<[number, string | null]> => [id, await loadSystemName(id)])
    ),
    loadTypeNames(typeIds),
  ]);

  const systemNames = new Map<number, string>();
  for (const [id, name] of systemNamePairs) {
    if (name) systemNames.set(id, name);
  }
  return { systemNames, typeNames };
}
