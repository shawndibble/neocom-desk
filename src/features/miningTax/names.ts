/** Solar-system and ore-type name resolution for the Moon Mining Tax ledger (issue #523). */
import { loadSystemNameAndSecurity } from '@/features/character/systemSecurity';
import { loadTypeNames } from '@/features/character/typeNames';
import type { MoonMiningTaxRow } from './snapshot';

export interface MiningTaxNames {
  systemNames: Map<number, string>;
  /** Absent for a system that failed to resolve — distinct from a legitimate 0.0 (nullsec). */
  systemSecurity: Map<number, number>;
  typeNames: Map<number, string>;
}

export async function resolveRowNames(rows: readonly MoonMiningTaxRow[]): Promise<MiningTaxNames> {
  const systemIds = [...new Set(rows.map((row) => row.entry.solarSystemId))];
  const typeIds = [
    ...new Set(rows.flatMap((row) => row.entry.oreLines.map((line) => line.typeId))),
  ];

  const [systemRows, typeNames] = await Promise.all([
    Promise.all(systemIds.map(async (id) => ({ id, ...(await loadSystemNameAndSecurity(id)) }))),
    loadTypeNames(typeIds),
  ]);

  const systemNames = new Map<number, string>();
  const systemSecurity = new Map<number, number>();
  for (const { id, name, security } of systemRows) {
    if (name) systemNames.set(id, name);
    if (security !== null) systemSecurity.set(id, security);
  }
  return { systemNames, systemSecurity, typeNames };
}
