import { loadSystemNameAndSecurity } from '@/features/character/systemSecurity';
import { loadOreFormNames } from './oreForm';
import type { MoonMiningTaxRow } from './snapshot';

export interface MiningTaxNames {
  systemNames: Map<number, string>;
  systemSecurity: Map<number, number>;
  typeNames: Map<number, string>;
}

export async function resolveRowNames(
  rows: readonly MoonMiningTaxRow[],
  compressed = true
): Promise<MiningTaxNames> {
  const systemIds = [...new Set(rows.map((row) => row.entry.solarSystemId))];
  const typeIds = [
    ...new Set(rows.flatMap((row) => row.entry.oreLines.map((line) => line.typeId))),
  ];

  const [systemRows, typeNames] = await Promise.all([
    Promise.all(systemIds.map(async (id) => ({ id, ...(await loadSystemNameAndSecurity(id)) }))),
    loadOreFormNames(typeIds, compressed),
  ]);

  const systemNames = new Map<number, string>();
  const systemSecurity = new Map<number, number>();
  for (const { id, name, security } of systemRows) {
    if (name) systemNames.set(id, name);
    if (security !== null) systemSecurity.set(id, security);
  }
  return { systemNames, systemSecurity, typeNames };
}

export function systemLabel(systemNames: ReadonlyMap<number, string>, id: number): string {
  return systemNames.get(id) ?? `#${String(id)}`;
}
