/**
 * "Find the best thing to build": every one-planet recipe, valued per planet at
 * the pilot's sell market and ranked.
 *
 * ## What is a recipe here
 *
 * A P1 or a P2 a single planet can make entirely from its own ground. Never raw
 * P0 (huge volume into a thin market), and never P3 and above, which need
 * several planets and live in the Map and the Goal Planner.
 *
 * ## Per planet, at one host
 *
 * The caller scores each recipe on each planet type that can host it
 * (`RecipeRow`, one per recipe and type). A recipe is valued on a planet type
 * the pilot already has when one hosts it, and on its best host otherwise: that
 * is the planet they would add. The type used (`useType`) is carried so the
 * card can say so.
 *
 * ## "Better, about the same, or worse than X"
 *
 * X is always named: the best P1 the same planet type sells, because "make this
 * instead of just selling that" is the choice a pilot actually faces. Within
 * `NET_TOLERANCE` (5%, the line the host picker draws) counts as the same.
 *
 * ## Unknown is not zero
 *
 * A recipe the hub does not price has no figure; it is dropped from the ranking
 * and listed in `unpriced`, never ranked at zero.
 *
 * ## A Command Center the pilot has not trained
 *
 * A row the pilot's Command Center cannot host still ranks, tagged
 * `needsCcLevel` with the lowest level that hosts it: below every setup that
 * fits, lowest level first. A recipe takes a host that fits over a richer one
 * that does not. Only fitting rows count toward `bestAnywherePerDay`.
 *
 * Pure: rows are parameters.
 */

import { NET_TOLERANCE } from './planBest';
import type { PlanetType } from './goalTypes';
import type { PiTier, PinCounts, PinLoad } from './types';

export type { PlanetType };

/** How a recipe's one-planet layout is built and run: what "Show me how" draws. */
export interface RecipeLayout {
  unitsPerDay: number;
  /** The pins the layout is built from, overhead included. */
  pins: PinCounts;
  /** The P0s it extracts, and the factories in the order they are set (inputs first). */
  extracts: readonly number[];
  makes: readonly { typeId: number; facility: 'basic' | 'advanced' | 'highTech' }[];
  /** Heads on each Extractor Control Unit the layout was fitted with. */
  headsPerExtractor?: number;
  /**
   * What the layout draws against the Command Center it needs, from the fit
   * that scored it: the tag, Show me how and its meter all read this one.
   * Absent when the caller could not compute it.
   */
  fit?: RecipeFit;
}

export interface RecipeFit {
  /** The lowest Command Center upgrade level that hosts the layout. */
  level: number;
  used: PinLoad;
  /** That level's CPU/Powergrid. */
  budget: PinLoad;
}

/** One recipe valued on one planet type. */
export interface RecipeRow {
  typeId: number;
  name: string;
  tier: PiTier;
  /** The planet type that hosts it for this row. */
  planetType: PlanetType;
  /** ISK a day from one planet, after customs and sales tax, at the sell market. */
  iskPerDay: number;
  /** m3 a day that planet ships. */
  m3PerDay: number;
  layout?: RecipeLayout;
  /**
   * The lowest Command Center Upgrades level that hosts the layout, set only
   * when that is above what the pilot has. Absent: it fits their Command Center.
   */
  needsCcLevel?: number;
}

export type RecipeFilter = 'any' | 'p1' | 'p2';

export interface RecipeComparison {
  verdict: 'better' | 'same' | 'worse';
  /** The recipe is the reference product itself. */
  isReference: boolean;
  versus: { typeId: number; name: string; planetType: PlanetType; iskPerDay: number };
}

export interface RecipeRank {
  typeId: number;
  name: string;
  tier: 1 | 2;
  /** ISK a day from one planet of `useType`. */
  iskPerDay: number;
  m3PerDay: number;
  /** The planet type the figure is for. */
  useType: PlanetType;
  /** Every planet type that can host it, sorted. */
  hostTypes: PlanetType[];
  /** The hosts the pilot has. */
  haveTypes: PlanetType[];
  comparison: RecipeComparison | null;
  /** The layout for `useType`, when the caller supplied one. */
  layout?: RecipeLayout;
  /** Set when no host the ranking picked fits the pilot's Command Center: the level it needs. */
  needsCcLevel?: number;
}

export interface RecipeRanking {
  recipes: RecipeRank[];
  /** The best any one-planet recipe that fits earns on any planet type. Null when nothing fits. */
  bestAnywherePerDay: number | null;
  /** Recipes the hub has no price for, passed through from the caller. */
  unpriced: number[];
}

const byValue = (a: RecipeRow, b: RecipeRow) =>
  b.iskPerDay - a.iskPerDay || a.tier - b.tier || a.typeId - b.typeId;

const levelOf = (row: { needsCcLevel?: number }) => row.needsCcLevel ?? 0;

/** Fits first, then the lowest level it needs, then the usual value order. */
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
    // A host that fits beats one that does not, owned or not; ownership decides within a tier.
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
