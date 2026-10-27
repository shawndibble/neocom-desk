/**
 * View model for the Skill Plan editor's "Skills to buy" panel: the plan's
 * skills the character hasn't trained, priced at the selected hub. Pure — no
 * fetch/DOM/Dexie.
 */

export interface SkillToBuyRow {
  typeID: number;
  name: string;
  /** Lowest sell; null means no sell orders, never 0 ISK. */
  price: number | null;
  /** Hub station first; the hub's region when the station has no sell orders. */
  source: 'hub' | 'region' | null;
}

export interface SkillsToBuy {
  rows: SkillToBuyRow[];
  /** Sum of the priced rows. */
  total: number;
  unpricedCount: number;
  /** `Name 1` per line, for the in-game multibuy window. */
  multibuy: string;
}

/** Distinct plan skills the character has not trained, in plan order. */
export function skillsToBuyTypeIds(
  entries: readonly { skillTypeID: number }[],
  trainedSkills: ReadonlyMap<number, unknown>
): number[] {
  const seen = new Set<number>();
  for (const entry of entries) {
    if (!trainedSkills.has(entry.skillTypeID)) seen.add(entry.skillTypeID);
  }
  return [...seen];
}

export function buildSkillsToBuy(
  typeIds: readonly number[],
  nameFor: (typeID: number) => string,
  hubPrices: ReadonlyMap<number, number | null>,
  regionPrices: ReadonlyMap<number, number | null>
): SkillsToBuy {
  const rows = typeIds.map((typeID): SkillToBuyRow => {
    const hub = hubPrices.get(typeID) ?? null;
    const region = regionPrices.get(typeID) ?? null;
    if (hub !== null) return { typeID, name: nameFor(typeID), price: hub, source: 'hub' };
    if (region !== null) return { typeID, name: nameFor(typeID), price: region, source: 'region' };
    return { typeID, name: nameFor(typeID), price: null, source: null };
  });
  return {
    rows,
    total: rows.reduce((sum, row) => sum + (row.price ?? 0), 0),
    unpricedCount: rows.filter((row) => row.price === null).length,
    multibuy: rows.map((row) => `${row.name} 1`).join('\n'),
  };
}
