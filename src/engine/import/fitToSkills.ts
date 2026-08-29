/**
 * Turn a parsed EFT fit (see `eftFit.ts`) into the skills a character needs
 * to fly it: aggregate the max required level per skill across the hull and
 * every module/charge/drone, then sort by skillTypeID (stable sort) for a
 * deterministic, diffable result independent of item order in the fit.
 *
 * IMPORTANT — our slim SDE (src/sde/types.ts, built by scripts/build-sde.mjs)
 * does not carry per-type required-skill dogma attributes: `skills.json`'s
 * `SkillType.prereqs` only covers skill-of-skill dependencies, not the
 * "this module needs Gunnery IV" relationships ships/modules carry. The
 * caller must supply a `RequiredSkillsLookup` derived from one of:
 *   - ESI `GET /universe/types/{type_id}/` dogma_attributes: paired
 *     `requiredSkillN` / `requiredSkillNLevel` attributes (N = 1, 2, 3, …;
 *     everef.net's dogma attribute dump has the full set — don't hardcode a
 *     max N, a fit item can require more than 3 skills), or
 *   - a future SDE extension (e.g. a generated typeDogma.json).
 * That keeps this module a pure aggregator with no ESI/SDE-shape coupling.
 */

import type { PlanEntry } from '@/engine/types';
import type { EftFit } from '@/engine/import/eftFit';

export interface RequiredSkill {
  skillTypeID: number;
  level: number;
}

/** Caller-supplied: typeID -> the skills (and levels) required to use that type. */
export type RequiredSkillsLookup = (typeID: number) => readonly RequiredSkill[];

/** Minimal catalog shape needed to resolve an item name to a typeID. */
export type TypeCatalog = ReadonlyMap<string, { typeID: number }>;

export interface FitToSkillsError {
  itemName: string;
  reason: string;
}

export interface FitToSkillsResult {
  entries: PlanEntry[];
  errors: FitToSkillsError[];
}

/** The slice of a parsed EftFit this function needs. */
export type FitItems = Pick<EftFit, 'shipName' | 'items'>;

/**
 * Aggregate required skill levels across a fit's hull + items.
 * Never throws: item names that don't resolve in `typeByName` become error
 * entries instead. An empty/unresolved `shipName` (e.g. an EFT paste whose
 * header failed to parse) is skipped silently, not reported as an error.
 */
export function fitToSkills(
  fit: FitItems,
  typeByName: TypeCatalog,
  requiredSkills: RequiredSkillsLookup
): FitToSkillsResult {
  const errors: FitToSkillsError[] = [];
  const levelByTypeID = new Map<number, number>();

  const parts = fit.shipName ? [{ name: fit.shipName, quantity: 1 }, ...fit.items] : fit.items;

  for (const { name } of parts) {
    const type = typeByName.get(name.toLowerCase());
    if (!type) {
      errors.push({ itemName: name, reason: 'unknown item' });
      continue;
    }
    for (const req of requiredSkills(type.typeID)) {
      const current = levelByTypeID.get(req.skillTypeID) ?? 0;
      if (req.level > current) levelByTypeID.set(req.skillTypeID, req.level);
    }
  }

  const entries: PlanEntry[] = [...levelByTypeID.entries()]
    .map(([skillTypeID, targetLevel]) => ({ skillTypeID, targetLevel }))
    .sort((a, b) => a.skillTypeID - b.skillTypeID);

  return { entries, errors };
}
