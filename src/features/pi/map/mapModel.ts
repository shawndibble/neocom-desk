import { piTier } from '@/engine/pi/chain';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { RecipeRank } from '@/engine/pi/planRecipes';
import type { PiData, PiFactoryKind } from '@/sde/types';
import type { ChainEstimateView } from '../chainEstimateModel';
import type { PlanAdvice } from '../planAdviceModel';

export type MapTier = 0 | 1 | 2 | 3 | 4;

export const DOCK_MIN_PANEL_WIDTH = 1500;

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

export type MapFacility = 'extractor' | PiFactoryKind;

export interface MapProduct {
  typeId: number;
  name: string;
  tier: MapTier;
  inputs: number[];
  raws: number[];
  hosts: PlanetType[];
  facility: MapFacility;
}

export interface MapGraph {
  tiers: Record<MapTier, MapProduct[]>;
  byId: ReadonlyMap<number, MapProduct>;
  planetTypes: readonly PlanetType[];
}

const byName = (a: MapProduct, b: MapProduct) => a.name.localeCompare(b.name);

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

export function canMake(graph: MapGraph, typeId: number, types: ReadonlySet<PlanetType>): boolean {
  const product = graph.byId.get(typeId);
  if (!product) return false;
  if (product.tier === 0) return product.hosts.some((type) => types.has(type));
  if (!product.hosts.some((type) => types.has(type))) return false;
  return product.raws.every((raw) => graph.byId.get(raw)!.hosts.some((type) => types.has(type)));
}

export interface Unlocked {
  highlight: ReadonlySet<number>;
  productIds: number[];
}

export function unlockedBy(
  graph: MapGraph,
  types: ReadonlySet<PlanetType>,
  ticked: ReadonlySet<PlanetType>
): Unlocked {
  const added = [...types].filter((type) => !ticked.has(type));
  if (added.length === 0) return { highlight: new Set(), productIds: [] };
  const with_ = new Set<PlanetType>([...ticked, ...added]);
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
  have: boolean;
  raws: number[];
  made: number[];
}

export interface Trace {
  product: number;
  ids: ReadonlySet<number>;
  edges: ReadonlyArray<readonly [number, number]>;
  planetEdges: ReadonlyArray<readonly [PlanetType, number]>;
  planets: TracedPlanet[];
  alternatives: PlanetType[];
  rest: number[];
}

export function groupByTier(graph: MapGraph, ids: Iterable<number>): number[][] {
  const byTier = new Map<MapTier, number[]>();
  for (const id of ids) {
    const product = graph.byId.get(id);
    if (!product) continue;
    const group = byTier.get(product.tier);
    if (group) group.push(id);
    else byTier.set(product.tier, [id]);
  }
  return [...byTier.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}

export function traceProduct(
  graph: MapGraph,
  typeId: number,
  who: {
    owned: ReadonlySet<PlanetType>;
    ticked: ReadonlySet<PlanetType>;
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

export type ProductFigure =
  | {
      kind: 'ranked';
      iskPerDay: number;
      m3PerDay: number;
      useType: PlanetType;
      hostTypes: PlanetType[];
      haveTypes: PlanetType[];
      verdict: 'better' | 'same' | 'worse' | null;
      isReference: boolean;
      versus: { typeId: number; name: string; planetType: PlanetType; iskPerDay: number } | null;
      needsCcLevel: number | null;
    }
  | {
      kind: 'unranked';
      reason: 'raw' | 'tier' | 'unpriced' | 'not-one-planet' | 'no-fit';
      chain?: ChainEstimateView;
      whatIf?: { types: readonly PlanetType[]; iskPerDay: number; planets: number };
    };

export function tileChainIsk(figure: ProductFigure): number | null {
  if (figure.kind !== 'unranked') return null;
  return (figure.whatIf ?? figure.chain)?.iskPerDay ?? null;
}

export function productFigure(
  advice: PlanAdvice,
  typeId: number,
  graph: MapGraph,
  pricesFailed = false
): ProductFigure {
  const product = graph.byId.get(typeId);
  if (!product || product.tier === 0) return { kind: 'unranked', reason: 'raw' };
  if (product.tier > 2) return { kind: 'unranked', reason: 'tier' };
  const recipe = advice.recipesWithTagged.recipes.find((r) => r.typeId === typeId);
  if (!recipe) {
    const onePlanet = graph.planetTypes.some(
      (type) =>
        product.hosts.includes(type) &&
        product.raws.every((raw) => graph.byId.get(raw)!.hosts.includes(type))
    );
    return {
      kind: 'unranked',
      reason:
        pricesFailed || advice.recipes.unpriced.includes(typeId)
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
    needsCcLevel: recipe.needsCcLevel ?? null,
  };
}

export function unlockedRecipe(
  advice: PlanAdvice,
  types: ReadonlySet<PlanetType>,
  owned: readonly PlanetType[]
): RecipeRank | null {
  let best: RecipeRank | null = null;
  for (const recipe of advice.recipes.recipes) {
    if (!recipe.hostTypes.some((host) => types.has(host))) continue;
    if (recipe.hostTypes.some((host) => owned.includes(host))) continue;
    if (best === null || recipe.iskPerDay > best.iskPerDay) best = recipe;
  }
  return best;
}

export type DetailMode = 'sheet' | 'drawer' | 'docked';

export function detailMode(args: { panelWidth: number; phone: boolean }): DetailMode {
  if (args.phone) return 'sheet';
  return args.panelWidth >= DOCK_MIN_PANEL_WIDTH ? 'docked' : 'drawer';
}
