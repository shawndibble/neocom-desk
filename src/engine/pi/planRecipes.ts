import { NET_TOLERANCE } from './planBest';
import type { PlanetType } from './goalTypes';
import type { PiTier, PinCounts, PinLoad } from './types';

export type { PlanetType };

export interface RecipeLayout {
  unitsPerDay: number;
  pins: PinCounts;
  extracts: readonly number[];
  makes: readonly { typeId: number; facility: 'basic' | 'advanced' | 'highTech' }[];
  headsPerExtractor?: number;
  fit?: RecipeFit;
}

export interface RecipeFit {
  level: number;
  used: PinLoad;
  budget: PinLoad;
}

export interface RecipeRow {
  typeId: number;
  name: string;
  tier: PiTier;
  planetType: PlanetType;
  iskPerDay: number;
  m3PerDay: number;
  layout?: RecipeLayout;
  needsCcLevel?: number;
}

export type RecipeFilter = 'any' | 'p1' | 'p2';

export interface RecipeComparison {
  verdict: 'better' | 'same' | 'worse';
  isReference: boolean;
  versus: { typeId: number; name: string; planetType: PlanetType; iskPerDay: number };
}

export interface RecipeRank {
  typeId: number;
  name: string;
  tier: 1 | 2;
  iskPerDay: number;
  m3PerDay: number;
  useType: PlanetType;
  hostTypes: PlanetType[];
  haveTypes: PlanetType[];
  comparison: RecipeComparison | null;
  layout?: RecipeLayout;
  needsCcLevel?: number;
}

export interface RecipeRanking {
  recipes: RecipeRank[];
  bestAnywherePerDay: number | null;
  unpriced: number[];
}

const byValue = (a: RecipeRow, b: RecipeRow) =>
  b.iskPerDay - a.iskPerDay || a.tier - b.tier || a.typeId - b.typeId;

const levelOf = (row: { needsCcLevel?: number }) => row.needsCcLevel ?? 0;

const byFitThenValue = (a: RecipeRow, b: RecipeRow) => levelOf(a) - levelOf(b) || byValue(a, b);

function isRankable(row: RecipeRow): boolean {
  return (row.tier === 1 || row.tier === 2) && Number.isFinite(row.iskPerDay) && row.iskPerDay > 0;
}

export function rankRecipes(input: {
  rows: readonly RecipeRow[];
  haveTypes: readonly PlanetType[];
  filter: RecipeFilter;
  unpriced?: readonly number[];
}): RecipeRanking {
  const rows = input.rows.filter(isRankable);
  const have = new Set(input.haveTypes);

  const byRecipe = new Map<number, RecipeRow[]>();
  for (const row of rows) {
    const list = byRecipe.get(row.typeId);
    if (list) list.push(row);
    else byRecipe.set(row.typeId, [row]);
  }

  const bestProcessedOn = (planetType: PlanetType): RecipeRow | null =>
    rows.filter((row) => row.tier === 1 && row.planetType === planetType).sort(byValue)[0] ?? null;

  const ranked: RecipeRank[] = [];
  for (const hosts of byRecipe.values()) {
    const mine = hosts.filter((row) => have.has(row.planetType));
    const fitting = hosts.filter((row) => !row.needsCcLevel);
    const fittingMine = fitting.filter((row) => have.has(row.planetType));
    const pool =
      fittingMine.length > 0
        ? fittingMine
        : fitting.length > 0
          ? fitting
          : mine.length > 0
            ? mine
            : hosts;
    const used = [...pool].sort(byFitThenValue)[0];
    const reference = bestProcessedOn(used.planetType);

    let comparison: RecipeComparison | null = null;
    if (reference) {
      const isReference = reference.typeId === used.typeId;
      const ratio = used.iskPerDay / reference.iskPerDay;
      comparison = {
        verdict: isReference
          ? 'same'
          : ratio > 1 + NET_TOLERANCE
            ? 'better'
            : ratio < 1 - NET_TOLERANCE
              ? 'worse'
              : 'same',
        isReference,
        versus: {
          typeId: reference.typeId,
          name: reference.name,
          planetType: reference.planetType,
          iskPerDay: reference.iskPerDay,
        },
      };
    }

    const hostTypes = [...new Set(hosts.map((row) => row.planetType))].sort();
    ranked.push({
      typeId: used.typeId,
      name: used.name,
      tier: used.tier as 1 | 2,
      iskPerDay: used.iskPerDay,
      m3PerDay: used.m3PerDay,
      useType: used.planetType,
      hostTypes,
      haveTypes: hostTypes.filter((type) => have.has(type)),
      comparison,
      ...(used.layout ? { layout: used.layout } : {}),
      ...(used.needsCcLevel ? { needsCcLevel: used.needsCcLevel } : {}),
    });
  }

  const keep = (recipe: RecipeRank) =>
    input.filter === 'any' || (input.filter === 'p1' ? recipe.tier === 1 : recipe.tier === 2);
  const recipes = ranked
    .filter(keep)
    .sort(
      (a, b) =>
        levelOf(a) - levelOf(b) ||
        b.iskPerDay - a.iskPerDay ||
        a.tier - b.tier ||
        a.typeId - b.typeId
    );

  const fitting = rows.filter((row) => !row.needsCcLevel);
  return {
    recipes,
    bestAnywherePerDay:
      fitting.length === 0 ? null : Math.max(...fitting.map((row) => row.iskPerDay)),
    unpriced: [...(input.unpriced ?? [])],
  };
}
