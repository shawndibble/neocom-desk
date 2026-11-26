import { searchKey } from '@/lib/tokenSearch';
import {
  CALDARI_FACTION_ID,
  PIRATE_FACTION_IDS,
  STACKED_CLASSES,
} from '@/engine/shipTree/templates';
import type { ShipTreeHullStatus, ShipTreeNodeDef } from '@/engine/shipTree/types';
import type { PlanEntry } from '@/engine/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { isEntryCovered } from '@/features/skills/planner/reorder';
import { romanLevel } from '@/engine/projection';
import type { Translate } from '@/lib/translate';
import { summarizeFilterValues, type ActiveFilter } from '@/components/ui';
import type {
  ShipTreeData,
  ShipTreeFaction,
  ShipTreeShip,
  ShipTreeTrait,
  SkillPrereq,
} from '@/sde/types';

export const DEFAULT_FACTION_ID = CALDARI_FACTION_ID;

export function resolveFactionID(data: ShipTreeData | null, requested: number): number {
  return data?.factions.some((f) => f.id === requested) ? requested : DEFAULT_FACTION_ID;
}

const IN_GAME_FACTION_ORDER = [
  500003, 500001, 500004, 500002, 500014, 500010, 500019, 500012, 500011, 500020, 500016, 500018,
  500026, 500027, 500006, 500017, 500029,
];

export function inGameFactionOrder<T extends { id: number }>(factions: readonly T[]): T[] {
  const rank = (id: number) => {
    const i = IN_GAME_FACTION_ORDER.indexOf(id);
    return i === -1 ? IN_GAME_FACTION_ORDER.length : i;
  };
  return [...factions].sort((a, b) => rank(a.id) - rank(b.id));
}

export function factionNameOf(factions: readonly ShipTreeFaction[], factionID: number): string {
  return factions.find((f) => f.id === factionID)?.name ?? '';
}

export function flyableCount(
  ships: readonly ShipTreeShip[],
  statuses: ReadonlyMap<number, ShipTreeHullStatus>
): { flyable: number; total: number } {
  const flyable = ships.filter((s) => statuses.get(s.typeID)?.canFly).length;
  return { flyable, total: ships.length };
}

export type FlyState = 'all' | 'canFly' | 'cantFly';

export interface ShipTreeFilter {
  fly: FlyState;
  mastery: ReadonlySet<number>;
}

export const NO_SHIP_TREE_FILTER: ShipTreeFilter = { fly: 'all', mastery: new Set() };

export const MASTERY_TIERS = [0, 1, 2, 3, 4, 5] as const;

export function masteryFilterActive(f: ShipTreeFilter): boolean {
  return f.mastery.size > 0 && f.fly !== 'cantFly';
}

export function isShipTreeFiltered(f: ShipTreeFilter): boolean {
  return f.fly !== 'all' || masteryFilterActive(f);
}

export function activeShipTreeFilters(
  filter: ShipTreeFilter,
  t: Translate
): ActiveFilter<ShipTreeFilter>[] {
  const active: ActiveFilter<ShipTreeFilter>[] = [];
  if (filter.fly !== 'all')
    active.push({
      label: t('ships.tree.fly.label'),
      value: t(filter.fly === 'canFly' ? 'ships.tree.canFly' : 'ships.tree.cantFly'),
      clear: (value) => ({
        ...value,
        fly: 'all',
        mastery: masteryFilterActive(value) ? value.mastery : NO_SHIP_TREE_FILTER.mastery,
      }),
    });
  if (masteryFilterActive(filter))
    active.push({
      label: t('ships.tree.mastery.label'),
      value: summarizeFilterValues(
        MASTERY_TIERS.filter((tier) => filter.mastery.has(tier)).map((tier) =>
          tier === 0 ? t('ships.tree.mastery.none') : romanLevel(tier)
        ),
        t
      ),
      clear: (value) => ({ ...value, mastery: NO_SHIP_TREE_FILTER.mastery }),
    });
  return active;
}

export function hullMatches(status: ShipTreeHullStatus | undefined, f: ShipTreeFilter): boolean {
  const canFly = status?.canFly === true;
  if (f.fly === 'canFly' && !canFly) return false;
  if (f.fly === 'cantFly' && canFly) return false;
  if (masteryFilterActive(f)) return canFly && f.mastery.has(status?.mastery ?? 0);
  return true;
}

export function flyStateCounts(
  ships: readonly ShipTreeShip[],
  statuses: ReadonlyMap<number, ShipTreeHullStatus>
): Record<FlyState, number> {
  const canFly = ships.filter((s) => statuses.get(s.typeID)?.canFly).length;
  return { all: ships.length, canFly, cantFly: ships.length - canFly };
}

export function masteryCounts(
  ships: readonly ShipTreeShip[],
  statuses: ReadonlyMap<number, ShipTreeHullStatus>
): number[] {
  const counts = MASTERY_TIERS.map(() => 0);
  for (const s of ships) {
    const status = statuses.get(s.typeID);
    if (status?.canFly) counts[status.mastery] += 1;
  }
  return counts;
}

export function factionMatchCounts(
  factionIDs: readonly number[],
  ships: readonly ShipTreeShip[],
  statuses: ReadonlyMap<number, ShipTreeHullStatus>,
  f: ShipTreeFilter
): Map<number, number> {
  const counts = new Map(factionIDs.map((id) => [id, 0]));
  for (const s of ships) {
    const n = counts.get(s.factionID);
    if (n !== undefined && hullMatches(statuses.get(s.typeID), f)) counts.set(s.factionID, n + 1);
  }
  return counts;
}

export interface LadderSection {
  def: ShipTreeNodeDef;
  children: LadderSection[];
}

export function ladderSections(defs: readonly ShipTreeNodeDef[]): LadderSection[] {
  const build = (def: ShipTreeNodeDef): LadderSection => ({
    def,
    children: defs.filter((d) => d.parent === def.id && isNested(d)).map(build),
  });
  return defs.filter((d) => !isNested(d) || d.parent === null).map(build);
}

export function sectionPath(sections: readonly LadderSection[], classId: number): number[] {
  for (const s of sections) {
    if (s.def.id === classId) return [classId];
    const below = sectionPath(s.children, classId);
    if (below.length) return [s.def.id, ...below];
  }
  return [];
}

export function allSectionIds(sections: readonly LadderSection[]): number[] {
  return sections.flatMap((s) => [s.def.id, ...allSectionIds(s.children)]);
}

function isNested(def: ShipTreeNodeDef): boolean {
  return def.lane === 'branch' || def.lane === 'capital' || def.lane === 'drop';
}

export type TechMark = 't2' | 't3' | 'faction';

export function techMark(ship: ShipTreeShip): TechMark | null {
  if (ship.techLevel >= 3) return 't3';
  if (ship.techLevel === 2) return 't2';
  if (
    ship.metaLevel >= 6 ||
    STACKED_CLASSES.has(ship.treeGroupID) ||
    PIRATE_FACTION_IDS.has(ship.factionID)
  ) {
    return 'faction';
  }
  return null;
}

export interface TraitGroup {
  skillTypeID: number | null;
  traits: ShipTreeTrait[];
}

export function traitGroups(traits: readonly ShipTreeTrait[]): TraitGroup[] {
  const groups: TraitGroup[] = [];
  for (const trait of traits) {
    let group = groups.find((g) => g.skillTypeID === trait.skillTypeID);
    if (!group) {
      group = { skillTypeID: trait.skillTypeID, traits: [] };
      groups.push(group);
    }
    group.traits.push(trait);
  }
  return groups;
}

export function searchHulls(ships: readonly ShipTreeShip[], query: string): ShipTreeShip[] {
  const q = searchKey(query.trim());
  if (!q) return [];
  return ships
    .map((ship) => ({ ship, at: searchKey(ship.name).indexOf(q) }))
    .filter((hit) => hit.at >= 0)
    .sort((a, b) => a.at - b.at || a.ship.name.localeCompare(b.ship.name))
    .map((hit) => hit.ship);
}

export function tierComplete(
  tier: readonly SkillPrereq[] | undefined,
  trainedLevel: (skillTypeID: number) => number
): boolean {
  return !!tier && tier.length > 0 && tier.every((p) => trainedLevel(p.skillTypeID) >= p.level);
}

export function tierPlanned(
  tier: readonly SkillPrereq[] | undefined,
  trainedLevel: (skillTypeID: number) => number,
  planEntries: readonly PlanEntry[]
): boolean {
  if (tierComplete(tier, trainedLevel)) return false;
  return (
    !!tier &&
    tier.length > 0 &&
    tier.every(
      (p) =>
        trainedLevel(p.skillTypeID) >= p.level ||
        isEntryCovered(planEntries, p.skillTypeID, p.level)
    )
  );
}

export function masteryTierEntries(
  tiers: readonly (readonly SkillPrereq[])[],
  tier: number,
  trainedLevel: (skillTypeID: number) => number
): PlanEntry[] {
  const want = new Map<number, number>();
  for (const bundle of tiers.slice(0, tier)) {
    for (const p of bundle)
      want.set(p.skillTypeID, Math.max(want.get(p.skillTypeID) ?? 0, p.level));
  }
  return [...want]
    .filter(([id, level]) => trainedLevel(id) < level)
    .map(([skillTypeID, targetLevel]) => ({ skillTypeID, targetLevel }));
}

export function unplannedTierEntries(
  tiers: readonly (readonly SkillPrereq[])[],
  tier: number,
  trainedLevel: (skillTypeID: number) => number,
  planEntries: readonly PlanEntry[]
): PlanEntry[] {
  return masteryTierEntries(tiers, tier, trainedLevel).filter(
    (e) => !isEntryCovered(planEntries, e.skillTypeID, e.targetLevel)
  );
}

export function ownedBlueprintSummary(
  blueprints: readonly CharacterBlueprint[],
  blueprintTypeID: number
): { originals: number; copies: number } {
  const mine = blueprints.filter((b) => b.type_id === blueprintTypeID);
  const originals = mine.filter((b) => b.runs === -1).length;
  return { originals, copies: mine.length - originals };
}
