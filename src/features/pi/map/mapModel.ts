/**
 * The PI Map's own logic, pure over `PiData` and the recommendation model's
 * output. Nothing here prices anything: every ISK figure the Map shows is read
 * off `PlanAdvice` (`productFigure`, `unlockedRecipe`) so it is the number
 * Plan shows for the same product. This module only decides what is
 * reachable, what a chain looks like, and how the panels sit.
 */
import { piTier } from '@/engine/pi/chain';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { RecipeRank } from '@/engine/pi/planRecipes';
import type { PiData, PiFactoryKind } from '@/sde/types';
import type { PlanAdvice } from '../planAdviceModel';

export type MapTier = 0 | 1 | 2 | 3 | 4;

/** The detail panel docks beside the map only when the map panel is at least this wide. */
export const DOCK_MIN_PANEL_WIDTH = 1500;

/** The in-game order of planet types, which is also the planets column's order. */
const PLANET_ORDER: readonly PlanetType[] = [
  'barren',
  'gas',
  'ice',
  'lava',
  'oceanic',
  'plasma',
  'storm',
  'temperate',
];

/** An extractor pulls a raw material; anything made runs in the factory its schematic names. */
export type MapFacility = 'extractor' | PiFactoryKind;

export interface MapProduct {
  typeId: number;
  name: string;
  tier: MapTier;
  /** Direct inputs, none for a raw resource. */
  inputs: number[];
  /** Every raw resource under it (itself for a raw one), sorted by typeId. */
  raws: number[];
  /** Planet types that yield it (raw) or carry a factory for it (made). */
  hosts: PlanetType[];
  facility: MapFacility;
}

export interface MapGraph {
  tiers: Record<MapTier, MapProduct[]>;
  byId: ReadonlyMap<number, MapProduct>;
  planetTypes: readonly PlanetType[];
}

const byName = (a: MapProduct, b: MapProduct) => a.name.localeCompare(b.name);

/** P0 alphabetical; P1 in the order of the raw it refines, so the two columns line up; P2 to P4 alphabetical. */
export function buildMapGraph(pi: PiData): MapGraph {
  const byId = new Map<number, MapProduct>();
  const rawLeaves = (id: number): number[] => {
    const schematic = pi.schematics[String(id)];
    if (!schematic) return [id];
    return [...new Set(schematic.inputs.flatMap((input) => rawLeaves(input.typeID)))].sort(
      (a, b) => a - b
    );
  };
  for (const raw of pi.raw) {
    byId.set(raw.typeID, {
      typeId: raw.typeID,
      name: raw.name,
      tier: 0,
      inputs: [],
      raws: [raw.typeID],
      hosts: [...raw.planetTypes],
      facility: 'extractor',
    });
  }
  for (const [key, schematic] of Object.entries(pi.schematics)) {
    const typeId = Number(key);
    byId.set(typeId, {
      typeId,
      name: schematic.name,
      tier: piTier(typeId, pi) as MapTier,
      inputs: schematic.inputs.map((input) => input.typeID),
      raws: rawLeaves(typeId),
      hosts: [...schematic.planetTypes],
      facility: schematic.facility,
    });
  }
  const all = [...byId.values()];
  const tiers: Record<MapTier, MapProduct[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  tiers[0] = all.filter((p) => p.tier === 0).sort(byName);
  const p1 = all.filter((p) => p.tier === 1);
  tiers[1] = tiers[0]
    .map((raw) => p1.find((p) => p.inputs[0] === raw.typeId))
    .filter((p): p is MapProduct => p !== undefined);
  for (const tier of [2, 3, 4] as const)
    tiers[tier] = all.filter((p) => p.tier === tier).sort(byName);
  const present = new Set(all.flatMap((p) => p.hosts));
  return { tiers, byId, planetTypes: PLANET_ORDER.filter((type) => present.has(type)) };
}

/** Can these planet types, together, make it: every raw under it comes off one of them, and one hosts its factory. */
export function canMake(graph: MapGraph, typeId: number, types: ReadonlySet<PlanetType>): boolean {
  const product = graph.byId.get(typeId);
  if (!product) return false;
  if (product.tier === 0) return product.hosts.some((type) => types.has(type));
  if (!product.hosts.some((type) => types.has(type))) return false;
  return product.raws.every((raw) => graph.byId.get(raw)!.hosts.some((type) => types.has(type)));
}

export interface Unlocked {
  /** Everything that lights, raws included. */
  highlight: ReadonlySet<number>;
  /** The made products it unlocks (P1 up), tier then name. */
  productIds: number[];
}

/** What adding one planet type makes possible over the ticked ones. */
export function unlockedBy(
  graph: MapGraph,
  type: PlanetType,
  ticked: ReadonlySet<PlanetType>
): Unlocked {
  if (ticked.has(type)) return { highlight: new Set(), productIds: [] };
  const with_ = new Set<PlanetType>([...ticked, type]);
  const highlight = new Set<number>();
  for (const product of graph.byId.values()) {
    if (canMake(graph, product.typeId, with_) && !canMake(graph, product.typeId, ticked)) {
      highlight.add(product.typeId);
    }
  }
  const productIds = [...highlight]
    .map((id) => graph.byId.get(id)!)
    .filter((p) => p.tier >= 1)
    .sort((a, b) => a.tier - b.tier || byName(a, b))
    .map((p) => p.typeId);
  return { highlight, productIds };
}

export interface TracedPlanet {
  type: PlanetType;
  /** The pilot has a colony on this type. */
  have: boolean;
  /** The raw resources this planet is chosen for. */
  raws: number[];
  /** Everything this planet can make by itself on the way, raw first. */
  made: number[];
}

export interface Trace {
  product: number;
  /** The product and everything under it. */
  ids: ReadonlySet<number>;
  /** `[from, to]`: a wire from an input to what it feeds. */
  edges: ReadonlyArray<readonly [number, number]>;
  /** `[planet type, raw]`: a wire from a planet to a raw it supplies. */
  planetEdges: ReadonlyArray<readonly [PlanetType, number]>;
  planets: TracedPlanet[];
  /** When one planet could do it all, every type that could. Empty otherwise. */
  alternatives: PlanetType[];
  /** What no single planet makes alone, tier then name: made where the goods are brought together. */
  rest: number[];
}

/** The chain behind a product, back to the planet types that supply it, preferring the pilot's. */
export function traceProduct(
  graph: MapGraph,
  typeId: number,
  who: {
    owned: ReadonlySet<PlanetType>;
    ticked: ReadonlySet<PlanetType>;
    /** Planet types to choose first: the ones a Plan pick is built on. */
    prefer?: readonly PlanetType[];
  }
): Trace {
  const product = graph.byId.get(typeId)!;
  const ids = new Set<number>();
  const edges: [number, number][] = [];
  const walk = (id: number) => {
    if (ids.has(id)) return;
    ids.add(id);
    for (const input of graph.byId.get(id)!.inputs) {
      edges.push([input, id]);
      walk(input);
    }
  };
  walk(typeId);

  const preferred = [...graph.planetTypes].sort(
    (a, b) =>
      Number(who.prefer?.includes(b) ?? false) - Number(who.prefer?.includes(a) ?? false) ||
      Number(who.owned.has(b)) - Number(who.owned.has(a)) ||
      Number(who.ticked.has(b)) - Number(who.ticked.has(a))
  );
  const yields = (type: PlanetType, raw: number) => graph.byId.get(raw)!.hosts.includes(type);

  const alternatives = graph.planetTypes.filter(
    (type) => product.hosts.includes(type) && product.raws.every((raw) => yields(type, raw))
  );
  const cover: PlanetType[] = [];
  if (alternatives.length > 0) {
    cover.push(preferred.find((type) => alternatives.includes(type))!);
  } else {
    let left = [...product.raws];
    while (left.length > 0) {
      let best: PlanetType | null = null;
      let bestCount = 0;
      for (const type of preferred) {
        if (cover.includes(type)) continue;
        const count = left.filter((raw) => yields(type, raw)).length;
        if (count > bestCount) {
          best = type;
          bestCount = count;
        }
      }
      if (best === null) break;
      cover.push(best);
      left = left.filter((raw) => !yields(best, raw));
    }
    if (!cover.some((type) => product.hosts.includes(type))) {
      const host = preferred.find((type) => product.hosts.includes(type));
      if (host) cover.push(host);
    }
  }

  const assigned = new Set<number>();
  const planets: TracedPlanet[] = cover.map((type) => {
    const raws = product.raws.filter((raw) => !assigned.has(raw) && yields(type, raw));
    raws.forEach((raw) => assigned.add(raw));
    return { type, have: who.owned.has(type), raws, made: [] };
  });

  const madeAnywhere = new Set<number>();
  for (const planet of planets) {
    const here = new Set<number>(planet.raws);
    let grew = true;
    while (grew) {
      grew = false;
      for (const id of ids) {
        const item = graph.byId.get(id)!;
        if (item.tier === 0 || here.has(id)) continue;
        if (planet.raws.length === 0) continue;
        if (item.hosts.includes(planet.type) && item.inputs.every((input) => here.has(input))) {
          here.add(id);
          grew = true;
        }
      }
    }
    planet.made = [...here]
      .map((id) => graph.byId.get(id)!)
      .sort((a, b) => a.tier - b.tier || byName(a, b))
      .map((p) => p.typeId);
    planet.made.forEach((id) => madeAnywhere.add(id));
  }
  const rest = [...ids]
    .filter((id) => !madeAnywhere.has(id))
    .map((id) => graph.byId.get(id)!)
    .sort((a, b) => a.tier - b.tier || byName(a, b))
    .map((p) => p.typeId);

  const planetEdges: [PlanetType, number][] = planets.flatMap((planet) =>
    planet.raws.map((raw) => [planet.type, raw] as [PlanetType, number])
  );
  return { product: typeId, ids, edges, planetEdges, planets, alternatives, rest };
}

/** What the recommendation model says about one product on the map. */
export type ProductFigure =
  | {
      kind: 'ranked';
      /** ISK a day from one planet of `useType`, after customs and sales tax. */
      iskPerDay: number;
      /** m³ a day that planet ships: the hauling load. */
      m3PerDay: number;
      useType: PlanetType;
      hostTypes: PlanetType[];
      haveTypes: PlanetType[];
      /** Against the simplest product on `useType`; null when it has no reference. */
      verdict: 'better' | 'same' | 'worse' | null;
      isReference: boolean;
      versus: { typeId: number; name: string; planetType: PlanetType; iskPerDay: number } | null;
    }
  | { kind: 'unranked'; reason: 'raw' | 'tier' | 'unpriced' | 'not-one-planet' | 'no-fit' };

/**
 * Only one-planet P1 and P2 recipes are ranked. A P3 or P4 needs goods from
 * several planets, so it has no per-planet figure, and a P1 or P2 the hub does
 * not price has none either: unknown, never zero. `advice` must be built with
 * `recipeFilter: 'any'`.
 */
export function productFigure(advice: PlanAdvice, typeId: number, graph: MapGraph): ProductFigure {
  const product = graph.byId.get(typeId);
  if (!product || product.tier === 0) return { kind: 'unranked', reason: 'raw' };
  if (product.tier > 2) return { kind: 'unranked', reason: 'tier' };
  const recipe = advice.recipes.recipes.find((r) => r.typeId === typeId);
  if (!recipe) {
    const onePlanet = graph.planetTypes.some(
      (type) =>
        product.hosts.includes(type) &&
        product.raws.every((raw) => graph.byId.get(raw)!.hosts.includes(type))
    );
    return {
      kind: 'unranked',
      reason: advice.recipes.unpriced.includes(typeId)
        ? 'unpriced'
        : onePlanet
          ? 'no-fit'
          : 'not-one-planet',
    };
  }
  return {
    kind: 'ranked',
    iskPerDay: recipe.iskPerDay,
    m3PerDay: recipe.m3PerDay,
    useType: recipe.useType,
    hostTypes: recipe.hostTypes,
    haveTypes: recipe.haveTypes,
    verdict: recipe.comparison?.verdict ?? null,
    isReference: recipe.comparison?.isReference ?? false,
    versus: recipe.comparison?.versus ?? null,
  };
}

/**
 * The best one-planet recipe a new planet of `type` adds: one only that type
 * can host among the pilot's. `advice` is built with that type as a what-if,
 * so the figure is priced for it, not for another host.
 */
export function unlockedRecipe(
  advice: PlanAdvice,
  type: PlanetType,
  owned: readonly PlanetType[]
): RecipeRank | null {
  let best: RecipeRank | null = null;
  for (const recipe of advice.recipes.recipes) {
    if (!recipe.hostTypes.includes(type)) continue;
    if (recipe.hostTypes.some((host) => owned.includes(host))) continue;
    if (best === null || recipe.iskPerDay > best.iskPerDay) best = recipe;
  }
  return best;
}

export type DetailMode = 'sheet' | 'drawer' | 'docked';

/** Where the detail panel goes: a bottom sheet on a phone, else docked or a drawer by the map panel's own width. */
export function detailMode(args: { panelWidth: number; phone: boolean }): DetailMode {
  if (args.phone) return 'sheet';
  return args.panelWidth >= DOCK_MIN_PANEL_WIDTH ? 'docked' : 'drawer';
}
