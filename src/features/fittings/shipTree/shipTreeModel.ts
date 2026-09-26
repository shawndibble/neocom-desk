/**
 * The Ship Tree tab's view rules that sit on top of the engine
 * (`engine/shipTree`): which ladder classes carry an Ω chip, how the ladder
 * nests, a tile's tech corner, bonus grouping, search, and the Ship Info
 * window's Mastery and Blueprint read-outs. Pure — no React, no fetch.
 */
import { STACKED_CLASSES } from '@/engine/shipTree/templates';
import type { ShipTreeNodeDef } from '@/engine/shipTree/types';
import type { PlanEntry } from '@/engine/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { ShipTreeData, ShipTreeShip, ShipTreeTrait, SkillPrereq } from '@/sde/types';

/** Caldari State — the in-game tree's first tab. */
export const DEFAULT_FACTION_ID = 500001;

const CORVETTE = 4;

/** The faction the URL asked for when the tree has it, else the default. */
export function resolveFactionID(data: ShipTreeData | null, requested: number): number {
  return data?.factions.some((f) => f.id === requested) ? requested : DEFAULT_FACTION_ID;
}

/**
 * The classes the map draws a gold Ω in front of — the same rule as
 * `layoutShipTree`, per trunk, so the ladder's chips and the map's
 * hexagons always agree:
 * - main line: a class needing Omega after one that doesn't (the first
 *   main class counts from the root when there is no Corvette; the
 *   Corvette's rise into the Frigate carries none);
 * - a stack (branches, and separately the capital trunk): its first Omega
 *   class, unless the parent already needs Omega;
 * - industry line: as the main line, its first class covered by the
 *   Corvette (or the root Ω);
 * - a drop: Omega where its parent isn't.
 */
export function omegaChipClasses(
  defs: readonly ShipTreeNodeDef[],
  needsOmega: (classId: number) => boolean
): Set<number> {
  const chips = new Set<number>();
  const kids = (id: number, lane: ShipTreeNodeDef['lane']) =>
    defs.filter((d) => d.parent === id && d.lane === lane);
  const stack = (parentId: number, children: readonly ShipTreeNodeDef[]) => {
    let seen = needsOmega(parentId);
    for (const child of children) {
      if (!needsOmega(child.id) || seen) continue;
      chips.add(child.id);
      seen = true;
    }
  };

  const corvette = defs.find((d) => d.id === CORVETTE && d.lane === 'main');
  const mains = defs.filter((d) => d.lane === 'main' && d !== corvette);
  const rootOmega = !corvette && mains[0] !== undefined && needsOmega(mains[0].id);
  mains.forEach((def, i) => {
    const prev = mains[i - 1];
    if (prev ? needsOmega(def.id) && !needsOmega(prev.id) : rootOmega) chips.add(def.id);
    stack(def.id, kids(def.id, 'branch'));
    stack(def.id, kids(def.id, 'capital'));
  });

  const industry = defs.filter((d) => d.lane === 'industry');
  industry.forEach((def, i) => {
    const prev = industry[i - 1];
    const covered = prev ? needsOmega(prev.id) : corvette ? needsOmega(CORVETTE) : rootOmega;
    if (needsOmega(def.id) && !covered) chips.add(def.id);
    stack(def.id, kids(def.id, 'branch'));
    for (const drop of kids(def.id, 'drop')) {
      if (needsOmega(drop.id) && !needsOmega(def.id)) chips.add(drop.id);
    }
  });
  return chips;
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
  if (ship.metaLevel >= 6 || STACKED_CLASSES.has(ship.treeGroupID)) return 'faction';
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
