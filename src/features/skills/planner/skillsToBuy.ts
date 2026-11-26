export interface SkillToBuyRow {
  typeID: number;
  name: string;
  price: number | null;
  source: 'hub' | 'region' | null;
}

export interface SkillsToBuy {
  rows: SkillToBuyRow[];
  total: number;
  unpricedCount: number;
  multibuy: string;
}

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
