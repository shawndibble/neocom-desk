/**
 * The Ship Tree tab's view rules that sit on top of the engine
 * (`engine/shipTree`): how the ladder nests, flyable counts, a tile's tech
 * corner, bonus grouping, search, and the Ship Info window's Mastery and
 * Blueprint read-outs. Pure — no React, no fetch.
 */
import {
  CALDARI_FACTION_ID,
  PIRATE_FACTION_IDS,
  STACKED_CLASSES,
} from '@/engine/shipTree/templates';
import type { ShipTreeHullStatus, ShipTreeNodeDef } from '@/engine/shipTree/types';
import type { PlanEntry } from '@/engine/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type {
  ShipTreeData,
  ShipTreeFaction,
  ShipTreeShip,
  ShipTreeTrait,
  SkillPrereq,
} from '@/sde/types';

/** Caldari State — the in-game tree's first tab. */
export const DEFAULT_FACTION_ID = CALDARI_FACTION_ID;

/** The faction the URL asked for when the tree has it, else the default. */
export function resolveFactionID(data: ShipTreeData | null, requested: number): number {
  return data?.factions.some((f) => f.id === requested) ? requested : DEFAULT_FACTION_ID;
}

/** A faction's name, or '' for one the tree doesn't list. */
/**
 * The in-game Ship Tree panel's faction order: empires and ORE, then the
 * pirates, then the rest — read off an in-game screenshot.
 */
const IN_GAME_FACTION_ORDER = [
  500003, 500001, 500004, 500002, 500014, 500010, 500019, 500012, 500011, 500020, 500016, 500018,
  500026, 500027, 500006, 500017, 500029,
];

/** Factions in the in-game panel's order; any the game panel doesn't list go last, as given. */
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

/** How many of `ships` the pilot can fly, out of how many. */
export function flyableCount(
  ships: readonly ShipTreeShip[],
  statuses: ReadonlyMap<number, ShipTreeHullStatus>
): { flyable: number; total: number } {
  const flyable = ships.filter((s) => statuses.get(s.typeID)?.canFly).length;
  return { flyable, total: ships.length };
}

export interface LadderSection {
  def: ShipTreeNodeDef;
  children: LadderSection[];
}

/**
 * The ladder's shape: one section per main- and industry-line class in tree
 * order, each specialised class (branch, capital, drop) nested under its
 * parent. A class with no parent that isn't on a line — one the template
 * doesn't know yet — gets its own section so it still shows up.
 */
export function ladderSections(defs: readonly ShipTreeNodeDef[]): LadderSection[] {
  const build = (def: ShipTreeNodeDef): LadderSection => ({
    def,
    children: defs.filter((d) => d.parent === def.id && isNested(d)).map(build),
  });
  return defs.filter((d) => !isNested(d) || d.parent === null).map(build);
}

function isNested(def: ShipTreeNodeDef): boolean {
  return def.lane === 'branch' || def.lane === 'capital' || def.lane === 'drop';
}

export type TechMark = 't2' | 't3' | 'faction';

/** A tile's corner, always shown, as in game: II, III, or ◇ for Navy and faction hulls. */
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
  /** null: role bonuses. */
  skillTypeID: number | null;
  traits: ShipTreeTrait[];
}

/** A hull's bonuses grouped as the game shows them: per skill, then role bonuses, first-seen order. */
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

/** Hulls whose name contains `query`, earliest match first; none for a blank query. */
export function searchHulls(ships: readonly ShipTreeShip[], query: string): ShipTreeShip[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ships
    .map((ship) => ({ ship, at: ship.name.toLowerCase().indexOf(q) }))
    .filter((hit) => hit.at >= 0)
    .sort((a, b) => a.at - b.at || a.ship.name.localeCompare(b.ship.name))
    .map((hit) => hit.ship);
}

/** Whether every skill a Mastery tier asks for is trained. An empty tier is never complete. */
export function tierComplete(
  tier: readonly SkillPrereq[] | undefined,
  trainedLevel: (skillTypeID: number) => number
): boolean {
  return !!tier && tier.length > 0 && tier.every((p) => trainedLevel(p.skillTypeID) >= p.level);
}

/**
 * What reaching Mastery `tier` (1–5) still needs: tiers I..N merged by skill
 * at the highest level any of them asks, trained ones dropped.
 */
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

/** Owned originals and copies of one blueprint — one ESI row per copy (`quantity` is a sentinel). */
export function ownedBlueprintSummary(
  blueprints: readonly CharacterBlueprint[],
  blueprintTypeID: number
): { originals: number; copies: number } {
  const mine = blueprints.filter((b) => b.type_id === blueprintTypeID);
  const originals = mine.filter((b) => b.runs === -1).length;
  return { originals, copies: mine.length - originals };
}
