/**
 * "Find the best thing to build", shaped for drawing. The recommendation model
 * prices every one-planet recipe on every planet type (`PlanAdvice.recipeRows`);
 * this decides which of the pilot's planet types count, what a what-if planet
 * would unlock, and the order. No ISK figure is computed here: `rankRecipes`
 * ranks the model's own rows, so Plan, Map and Colonies share one number.
 *
 * ## Which types count
 *
 * - With colonies, the types they sit on start switched on; switching one off
 *   means "treat it as not mine" and recipes that need it read "find one". A
 *   what-if type counts as owned for the ranking and is marked "if added".
 * - With no colonies every type starts on ("all available") and switching one
 *   off hides the recipes that only it hosts: the pilot can't reach it.
 */
import type { PlanetType } from '@/engine/pi/goalTypes';
import { piTier } from '@/engine/pi/chain';
import { securityBand } from '@/engine/securityStatus';
import {
  rankRecipes,
  type RecipeFilter,
  type RecipeRank,
  type RecipeRow,
} from '@/engine/pi/planRecipes';
import type { PiData } from '@/sde/types';
import type { RawRow } from './planAdviceModel';
import { chainProductIds, type ChainEstimateView } from './chainEstimateModel';
import { canMakeWith, planetsNeeded, planetTypesOf } from './productPlanets';
import type { ChainEstimateOf } from './useChainEstimates';

export type TypeState = 'have' | 'whatif' | 'find';

export interface FindBestInput {
  rows: readonly RecipeRow[];
  unpriced: readonly number[];
  /** The planet types of the pilot's colonies. */
  colonyTypes: readonly PlanetType[];
  allTypes: readonly PlanetType[];
  /** Types switched off. */
  off: ReadonlySet<PlanetType>;
  whatIf: ReadonlySet<PlanetType>;
  filter: RecipeFilter;
  /** Product typeIDs the pilot's colonies sell today. */
  madeTypeIds: ReadonlySet<number>;
}

export interface TypeToggle {
  type: PlanetType;
  on: boolean;
}

export interface WhatIfChip {
  type: PlanetType;
  on: boolean;
  /** Recipes this type would newly host (under the current filter). */
  unlocks: number;
}

export interface RecipeCardView {
  rank: number;
  recipe: RecipeRank;
  hosts: { type: PlanetType; state: TypeState }[];
  /** Only a what-if planet makes it reachable: highlighted, and labelled, not colour alone. */
  isNew: boolean;
  /** One of the pilot's own planet types hosts it, so they can make it today. Always true with no colonies. */
  makeableNow: boolean;
}

export interface FindBestView {
  hasColonies: boolean;
  toggles: TypeToggle[];
  chips: WhatIfChip[];
  cards: RecipeCardView[];
  /** Rank of the first card that needs a planet the pilot lacks, under cards they can make now. Null with no such split. */
  addDividerBefore: number | null;
  /** The best recipe is one the pilot's colonies already make. */
  alreadyBest: boolean;
  unpricedCount: number;
  /** Some recipe ranks under the toggles when no tier filter is set. */
  hasRecipesAtAll: boolean;
}

export function buildFindBestView(input: FindBestInput): FindBestView {
  const hasColonies = input.colonyTypes.length > 0;
  const owned = [...new Set(input.colonyTypes)].sort();
  const base = new Set<PlanetType>(
    (hasColonies ? owned : input.allTypes).filter((type) => !input.off.has(type))
  );
  const have = new Set<PlanetType>([...base, ...input.whatIf]);
  const rows = hasColonies ? input.rows : input.rows.filter((row) => have.has(row.planetType));
  const ranking = rankRecipes({
    rows,
    haveTypes: [...have],
    filter: input.filter,
    unpriced: input.unpriced,
  });

  const stateOf = (type: PlanetType): TypeState =>
    !hasColonies ? 'find' : base.has(type) ? 'have' : input.whatIf.has(type) ? 'whatif' : 'find';

  const makeableNow = (recipe: RecipeRank) =>
    !hasColonies || recipe.hostTypes.some((type) => base.has(type));
  // Fits the Command Center first (the engine's order), then what the pilot can make
  // today, then ISK a day. The sort is stable, so each group keeps the engine's order.
  const ordered = [...ranking.recipes].sort(
    (a, b) =>
      (a.needsCcLevel ?? 0) - (b.needsCcLevel ?? 0) ||
      Number(!makeableNow(a)) - Number(!makeableNow(b))
  );
  const cards = ordered.map((recipe, i): RecipeCardView => {
    const unlockedByBase = recipe.hostTypes.some((type) => base.has(type));
    return {
      rank: i + 1,
      recipe,
      hosts: recipe.hostTypes.map((type) => ({ type, state: stateOf(type) })),
      isNew: hasColonies && !unlockedByBase && recipe.hostTypes.some((t) => input.whatIf.has(t)),
      makeableNow: makeableNow(recipe),
    };
  });
  const firstAdd = cards.findIndex((card) => !card.makeableNow);
  // A divider only when the can-make-now cards are a clean top block: an over-budget
  // setup the pilot hosts sorts below every fitting one, so it can split the groups.
  const clean = firstAdd > 0 && cards.slice(firstAdd).every((card) => !card.makeableNow);
  const addDividerBefore = clean ? cards[firstAdd].rank : null;

  const toggles = (hasColonies ? owned : [...input.allTypes]).map((type) => ({
    type,
    on: !input.off.has(type),
  }));

  // What a type would unlock: recipes it hosts that nothing the pilot has hosts.
  const everyRecipe = rankRecipes({
    rows: input.rows,
    haveTypes: [],
    filter: input.filter,
  }).recipes;
  const chips = hasColonies
    ? input.allTypes
        .filter((type) => !owned.includes(type))
        .map((type) => ({
          type,
          on: input.whatIf.has(type),
          unlocks: everyRecipe.filter(
            (recipe) =>
              recipe.hostTypes.includes(type) && !recipe.hostTypes.some((host) => base.has(host))
          ).length,
        }))
    : [];

  return {
    hasColonies,
    toggles,
    chips,
    cards,
    addDividerBefore,
    alreadyBest:
      hasColonies &&
      cards.length > 0 &&
      input.madeTypeIds.has(cards[0].recipe.typeId) &&
      cards[0].hosts.some((host) => host.state === 'have'),
    unpricedCount: ranking.unpriced.length,
    hasRecipesAtAll:
      input.filter === 'any'
        ? cards.length > 0
        : rankRecipes({ rows, haveTypes: [...have], filter: 'any' }).recipes.length > 0,
  };
}

// --- P3 and P4 chains ---------------------------------------------------------------

export interface ChainPick {
  typeId: number;
  name: string;
  tier: 3 | 4;
  estimate: ChainEstimateView;
}

export interface ChainPicks {
  /** Priced P3/P4 the planet-type toggles reach, most ISK a day first. */
  rows: ChainPick[];
  /** Reachable products still being priced. */
  pending: number;
}

/**
 * P3 and P4 beside the one-planet picks: a multi-planet estimate each, in a list
 * of its own and never given a pick number or ranked against one-planet
 * figures (decision 20261006-095530). Same reach rule as the recipes: the
 * pilot's planet types (or all, with no colonies), less any switched off, plus
 * what-if planets.
 */
export function buildChainPicks(
  input: Pick<FindBestInput, 'colonyTypes' | 'off' | 'whatIf'>,
  pi: PiData,
  chainOf: ChainEstimateOf
): ChainPicks {
  const hasColonies = input.colonyTypes.length > 0;
  const base = new Set<PlanetType>(
    (hasColonies ? input.colonyTypes : planetTypesOf(pi)).filter((type) => !input.off.has(type))
  );
  const have = new Set<PlanetType>([...base, ...input.whatIf]);
  const rows: ChainPick[] = [];
  let pending = 0;
  for (const typeId of chainProductIds(pi)) {
    const tier = tierOf(typeId, pi);
    if ((tier !== 3 && tier !== 4) || !canMakeWith(typeId, pi, have)) continue;
    const estimate = chainOf(typeId);
    if (estimate === undefined) pending += 1;
    else if (estimate)
      rows.push({ typeId, name: pi.schematics[String(typeId)].name, tier, estimate });
  }
  rows.sort((a, b) => b.estimate.iskPerDay - a.estimate.iskPerDay || a.typeId - b.typeId);
  return { rows, pending };
}

// --- All products ----------------------------------------------------------------

export interface ProductTile {
  typeId: number;
  name: string;
  tier: 0 | 1 | 2 | 3 | 4;
  /** ISK a day from one planet (a raw: sold as extracted); null without a one-planet figure. */
  perDay: number | null;
  /** A raw the sell market quotes no price for, so it has no figure. */
  noPrice: boolean;
  /** Planets it takes between them; 1 for a raw. */
  planets: number | null;
  /** The planet-type toggles cover it. */
  reachable: boolean;
  /** Reachable only with the what-if planet. */
  isNew: boolean;
  comparison: RecipeRank['comparison'];
}

export interface TierColumn {
  tier: 0 | 1 | 2 | 3 | 4;
  items: ProductTile[];
  reachableCount: number;
}

export function buildAllProducts(
  input: Pick<FindBestInput, 'rows' | 'colonyTypes' | 'off' | 'whatIf'> & {
    /** From `PlanAdvice.rawRows` / `rawUnpriced`. */
    rawRows?: readonly RawRow[];
    rawUnpriced?: readonly number[];
  },
  pi: PiData
): TierColumn[] {
  const allTypes = planetTypesOf(pi);
  const hasColonies = input.colonyTypes.length > 0;
  const base = new Set<PlanetType>(
    (hasColonies ? input.colonyTypes : allTypes).filter((type) => !input.off.has(type))
  );
  const have = new Set<PlanetType>([...base, ...input.whatIf]);
  // A tile's figure is one the pilot's Command Center can host; a setup that
  // needs a higher level is Best picks' to show, tagged.
  const fits = input.rows.filter((row) => !row.needsCcLevel);
  const rows = hasColonies ? fits : fits.filter((row) => have.has(row.planetType));
  const ranked = new Map(
    rankRecipes({ rows, haveTypes: [...have], filter: 'any' }).recipes.map((r) => [r.typeId, r])
  );
  const rawBest = new Map<number, number>();
  for (const raw of input.rawRows ?? []) {
    if (!have.has(raw.planetType)) continue;
    rawBest.set(raw.typeId, Math.max(rawBest.get(raw.typeId) ?? -Infinity, raw.iskPerDay));
  }
  const rawUnpriced = new Set(input.rawUnpriced ?? []);

  const entries: { typeId: number; name: string; tier: ProductTile['tier'] }[] = [
    ...pi.raw.map((raw) => ({ typeId: raw.typeID, name: raw.name, tier: 0 as const })),
    ...Object.entries(pi.schematics).flatMap(([key, schematic]) => {
      const typeId = Number(key);
      const tier = tierOf(typeId, pi);
      return tier === null ? [] : [{ typeId, name: schematic.name, tier }];
    }),
  ];

  return ([0, 1, 2, 3, 4] as const).map((tier) => {
    const items = entries
      .filter((entry) => entry.tier === tier)
      .map((entry): ProductTile => {
        const recipe = ranked.get(entry.typeId);
        const reachable = canMakeWith(entry.typeId, pi, have);
        const raw = entry.tier === 0;
        return {
          ...entry,
          perDay: raw ? (rawBest.get(entry.typeId) ?? null) : (recipe?.iskPerDay ?? null),
          noPrice: raw && rawUnpriced.has(entry.typeId),
          planets: planetsNeeded(entry.typeId, pi),
          reachable,
          isNew: input.whatIf.size > 0 && reachable && !canMakeWith(entry.typeId, pi, base),
          comparison: recipe?.comparison ?? null,
        };
      })
      .sort(
        (a, b) =>
          // Raws keep name order: a figure is shown, never a ranking of what to extract.
          (a.tier === 0 ? 0 : (b.perDay ?? -1) - (a.perDay ?? -1)) ||
          (a.planets ?? 99) - (b.planets ?? 99) ||
          a.name.localeCompare(b.name)
      );
    return { tier, items, reachableCount: items.filter((item) => item.reachable).length };
  });
}

function tierOf(typeId: number, pi: PiData): 1 | 2 | 3 | 4 | null {
  try {
    const tier = piTier(typeId, pi);
    return tier >= 1 && tier <= 4 ? (tier as 1 | 2 | 3 | 4) : null;
  } catch {
    return null;
  }
}

// --- The planet finder's defaults ---------------------------------------------------

/** "Highsec only" starts on when the origin is highsec; unknown security leaves it off. */
export function defaultHighsecOnly(originSecurity: number | null | undefined): boolean {
  return originSecurity != null && securityBand(originSecurity) === 'highsec';
}

/** A nullsec system shows the Skyhook / customs note. */
export function needsSkyhookNote(security: number | null | undefined): boolean {
  return security != null && securityBand(security) === 'nullsec';
}
