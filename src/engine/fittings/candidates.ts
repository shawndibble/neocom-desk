/**
 * The Fitting editor's Add panel (issue #1533) narrows the market catalogue
 * in two passes: the cheap, static one here (search text, which rack an item
 * takes, market group, meta group) runs on every keystroke and needs no ship
 * data; the engine's own fit check (`dogmaFittingEngine.ts`'s
 * `checkCandidates`) then runs only on the few results that survive, and
 * `classifyRuleBreaks` turns what it reports into the two chips it drives.
 */

import type { FittingSlotKind } from './types';

/** A rack plus the drone bay — the same values as `FittingSlotAssignment` in `src/sde/types.ts`. */
export type CandidateRack = FittingSlotKind | 'drone';

export interface CandidateEntry {
  typeId: number;
  name: string;
  marketGroupId: number;
}

export interface CandidateSearchOptions {
  query: string;
  /** Only items taking this rack ("fits this slot"); null = any fittable item. */
  rack: CandidateRack | null;
  /** Which rack each type id takes; a type absent here isn't fittable at all. */
  rackOf: Readonly<Record<string, CandidateRack>>;
  /** Only items in these market groups; null = anywhere. */
  groupIds: ReadonlySet<number> | null;
  /** Only this meta group (Tech I, Tech II, Faction, …); null = any. */
  metaGroupId: number | null;
  metaGroupOf: (typeId: number) => number | null;
}

export const CANDIDATE_LIMIT = 100;

export function searchCandidates<T extends CandidateEntry>(
  entries: readonly T[],
  options: CandidateSearchOptions,
  limit = CANDIDATE_LIMIT
): T[] {
  const query = options.query.trim().toLowerCase();
  const matches = entries.filter((entry) => {
    const rack = options.rackOf[String(entry.typeId)];
    if (rack === undefined) return false;
    if (options.rack !== null && rack !== options.rack) return false;
    if (options.groupIds !== null && !options.groupIds.has(entry.marketGroupId)) return false;
    if (options.metaGroupId !== null && options.metaGroupOf(entry.typeId) !== options.metaGroupId)
      return false;
    return query === '' || entry.name.toLowerCase().includes(query);
  });
  matches.sort((a, b) => a.name.localeCompare(b.name));
  return matches.slice(0, limit);
}

/** The market groups the browser's tree shows: those holding an item of `rack` (any fittable item for null), plus ancestors. */
export function groupsHoldingRack(
  entries: readonly CandidateEntry[],
  rack: CandidateRack | null,
  rackOf: Readonly<Record<string, CandidateRack>>,
  parentOf: ReadonlyMap<number, number | null>
): Set<number> {
  const groups = new Set<number>();
  for (const entry of entries) {
    const entryRack = rackOf[String(entry.typeId)];
    if (entryRack === undefined || (rack !== null && entryRack !== rack)) continue;
    let groupId: number | null | undefined = entry.marketGroupId;
    while (groupId !== null && groupId !== undefined && !groups.has(groupId)) {
      groups.add(groupId);
      groupId = parentOf.get(groupId);
    }
  }
  return groups;
}

/**
 * Rules (the engine's `Rule.type`) under which an item cannot go on this hull
 * at all, whatever else is fitted: wrong rack, no hardpoint, wrong rig size,
 * a hull-restricted or capital/structure item, a one-per-ship limit.
 * Resource overflow is deliberately absent: the game lets you fit an item
 * that overflows CPU or powergrid — it just can't online — and the editor
 * flashes the bar rather than hiding the item.
 */
const HULL_RULES: ReadonlySet<string> = new Set([
  'wrong_slot',
  'wrong_slot_index',
  'slots',
  'subsystem_taken',
  'rig_size',
  'ship_restricted',
  'capital_item',
  'structure_item',
  'ship_item',
  'max_group',
  'max_type',
]);

export function classifyRuleBreaks(ruleTypes: readonly string[]): {
  fitsHull: boolean;
  canFly: boolean;
} {
  return {
    fitsHull: !ruleTypes.some((rule) => HULL_RULES.has(rule)),
    canFly: !ruleTypes.includes('skill'),
  };
}
