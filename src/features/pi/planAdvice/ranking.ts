import type { PiData } from '@/sde/types';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { HOURS_PER_DAY, type SellBooks } from '@/engine/pi/planAdvice';
import {
  rankRecipes,
  type RecipeFit,
  type RecipeRanking,
  type RecipeRow,
} from '@/engine/pi/planRecipes';
import {
  recommendStopTier,
  type ScoredStopTier,
  type StopTierAdvice,
  type StopTierEntry,
} from '@/engine/pi/stopTier';
import type { PinLoad } from '@/engine/pi/types';
import { colonyBudget } from '../colonyBudgetModel';
import { highsecCustomsRate } from '../customsRate';
import { localResourcesFor } from '../systemPlanetModel';
import { DEFAULT_PLANNER_HEADS, type PlannerColonyRow } from '../goalPlannerModel';
import { meanHeadsPerExtractor } from '../stopTierModel';
import { medianNewLinkLoad } from '../unbuiltPlanModel';
import type { ChainBasis } from '../chainEstimateModel';
import { isScoredRecipe, iskPerHourOf, recipeOf, safeVolume } from './rebuild';
import type { PlanAdviceInput, RankingBasis, RawRow } from './types';

/**
 * The Command Center level a recipe ranking assumes when the pilot's skill
 * never loaded (or they have no colony to read one from). The ranking is an
 * estimate either way, and `rankingBasis.ccAssumed` says so; IV is the common
 * trained level, so the ranking shows P2s a typical pilot can really host.
 */
export const ASSUMED_RANKING_CC_LEVEL = 4;

/**
 * A pin's link on a planet the pilot has not colonised: roughly a 50 km hop
 * (15 + 0.2/km CPU, 10 + 0.15/km power, per `engine/pi/linkCost.ts`). Used only
 * for the recipe ranking when no colony of theirs has a hop to borrow.
 */
export const ASSUMED_RANKING_LINK_COST: PinLoad = { cpu: 25, powergrid: 18 };

function hostsTier2(advice: StopTierAdvice): boolean {
  return advice.entries.some((entry) => entry.tier === 2 && entry.status !== 'does-not-fit');
}

/** A ranking candidate and the heads per extractor it was fitted with. */
interface FittedEntry {
  entry: StopTierEntry;
  heads: number;
}

function isRecipeEntry(fitted: FittedEntry): fitted is FittedEntry & { entry: ScoredStopTier } {
  return isScoredRecipe(fitted.entry);
}

function fitsBudget(used: PinLoad, budget: PinLoad): boolean {
  return used.cpu <= budget.cpu && used.powergrid <= budget.powergrid;
}

// --- Recipe ranking ------------------------------------------------------------

/**
 * Every one-planet recipe on every planet type, valued the way a planet the
 * pilot has not built yet would be: at their own measured extraction rate
 * (else the typed fallback; per head kept, for a P2 stepped to fewer heads),
 * their Command Center level, and a link cost borrowed from their colonies
 * (else a stated default). `rankingBasis` carries which of those were assumed,
 * so the page can badge the figures as estimates. Each layout carries the fit
 * it was scored with.
 */
export function rankingFor(args: {
  input: PlanAdviceInput;
  rows: readonly PlannerColonyRow[];
  books: SellBooks;
  pi: PiData;
  haulHours: number;
}): {
  ranking: RecipeRanking;
  withTagged: RecipeRanking;
  rows: RecipeRow[];
  rawRows: RawRow[];
  rawUnpriced: number[];
  basis: RankingBasis;
  chain: ChainBasis;
} {
  const { input, rows, books, pi, haulHours } = args;
  const withAdvice = rows.flatMap((row) => (row.advice ? [row.advice] : []));

  const measured = rows.flatMap((row) =>
    [...(row.colony?.ratePerEcu.values() ?? [])]
      .filter((rate) => rate.source === 'measured')
      .map((rate) => rate.unitsPerHour)
  );
  const rate =
    measured.length > 0
      ? measured.reduce((sum, value) => sum + value, 0) / measured.length
      : input.prefs.fallbackRatePerHour;

  const withEcus = withAdvice.filter((a) => (a.pinLoad.counts.extractorControlUnit ?? 0) > 0);
  const headsMeasured = withEcus.length > 0;
  const heads = headsMeasured
    ? Math.round(withEcus.reduce((sum, a) => sum + meanHeadsPerExtractor(a), 0) / withEcus.length)
    : DEFAULT_PLANNER_HEADS;

  const borrowed = medianNewLinkLoad(
    withAdvice.flatMap((a) => (a.pinLoad.newLinkLoad ? [a.pinLoad.newLinkLoad] : []))
  );

  // The storage the pilot's own colonies buffer through, typically: a layout
  // fitted with none would be rejected for a weekly haul it would survive.
  const storageCounts = withAdvice.map((a) => a.pinLoad.counts.storage ?? 0).sort((a, b) => a - b);
  const storage =
    storageCounts.length > 0 ? storageCounts[Math.floor((storageCounts.length - 1) / 2)] : 0;

  const skill = input.skills.commandCenterUpgrades;
  const ceiling = colonyBudget(skill ?? ASSUMED_RANKING_CC_LEVEL, pi);
  const taxes = rows.map((row) => row.taxRate).sort((a, b) => a - b);
  const taxRate =
    taxes.length > 0
      ? taxes[Math.floor((taxes.length - 1) / 2)]
      : highsecCustomsRate(input.snapshot.customsSkill);

  const planetTypes = [...new Set(pi.raw.flatMap((resource) => resource.planetTypes))].sort();
  const recipeRows: RecipeRow[] = [];
  const unpriced = new Set<number>();
  const rawRows: RawRow[] = [];
  const rawUnpriced = new Set<number>();
  const maxLevel = Math.max(pi.infrastructure.commandCenterUpgrades.length - 1, 0);
  // The lowest level whose budget carries `used`: what Show me how and its meter
  // name for a layout that fits the pilot's own Command Center.
  const fitOf = (used: PinLoad, needsCcLevel: number | null): RecipeFit => {
    let level = needsCcLevel ?? 0;
    let { budget } = colonyBudget(level, pi);
    while (level < ceiling.level && !fitsBudget(used, budget)) {
      level += 1;
      budget = colonyBudget(level, pi).budget;
    }
    return { level, used, budget };
  };
  for (const planetType of planetTypes) {
    const adviceAt = (budget: PinLoad, headsPerExtractor: number, ratePerHour: number) =>
      recommendStopTier(
        {
          localResources: localResourcesFor(planetType, pi).map((resource) => resource.typeID),
          budget,
          infrastructure: pi.infrastructure,
          overhead: { launchpads: 1, storageFacilities: storage },
          headsPerExtractor,
          newLinkCost: borrowed ?? ASSUMED_RANKING_LINK_COST,
          extractionRatePerHour: ratePerHour,
          prices: books.prices,
          revenuePrices: books.revenuePrices,
          taxRate,
          salesTaxPct: books.salesTaxPct,
          linkCapacityPerHour: null,
          bufferHours: haulHours,
        },
        pi
      );
    // Heads must not decide whether a planet hosts a P2: a P0 colony's heads
    // overdraw a P2's two extractors. An assumed count steps the whole layout
    // down; then each P2 that still does not fit takes the most heads that do,
    // its rate scaled by heads kept. P1 keeps a measured count. `skip`: P2s a
    // lower level already hosts.
    const adviceFor = (budget: PinLoad, skip?: ReadonlySet<number>): FittedEntry[] => {
      let base = adviceAt(budget, heads, rate);
      let baseHeads = heads;
      if (!headsMeasured) {
        for (let tryHeads = heads - 2; tryHeads >= 1 && !hostsTier2(base); tryHeads -= 2) {
          base = adviceAt(budget, tryHeads, rate);
          baseHeads = tryHeads;
        }
      }
      const fitted = new Map(
        base.entries.map((entry) => [entry.typeId, { entry, heads: baseHeads }])
      );
      const unhosted = new Set(
        base.entries
          .filter((entry) => entry.tier === 2 && entry.status === 'does-not-fit')
          .filter((entry) => !skip?.has(entry.typeId))
          .map((entry) => entry.typeId)
      );
      for (let tryHeads = baseHeads - 1; tryHeads >= 1 && unhosted.size > 0; tryHeads -= 1) {
        for (const entry of adviceAt(budget, tryHeads, (rate * tryHeads) / baseHeads).entries) {
          if (!unhosted.has(entry.typeId) || entry.status === 'does-not-fit') continue;
          unhosted.delete(entry.typeId);
          fitted.set(entry.typeId, { entry, heads: tryHeads });
        }
      }
      return [...fitted.values()];
    };
    const rowFor = (
      fitted: FittedEntry & { entry: ScoredStopTier },
      needsCcLevel: number | null
    ): RecipeRow | null => {
      const { entry } = fitted;
      const volume = safeVolume(entry.typeId, pi);
      const isk = iskPerHourOf(entry, books, taxRate);
      if (volume === null || isk === null) return null;
      return {
        typeId: entry.typeId,
        name: entry.name,
        tier: entry.tier,
        planetType,
        iskPerDay: isk * HOURS_PER_DAY,
        m3PerDay: entry.unitsPerHour * HOURS_PER_DAY * volume,
        layout: {
          unitsPerDay: entry.unitsPerHour * HOURS_PER_DAY,
          pins: entry.pins,
          ...recipeOf(entry.typeId, pi),
          headsPerExtractor: fitted.heads,
          fit: fitOf(entry.used, needsCcLevel),
        },
        ...(needsCcLevel ? { needsCcLevel } : {}),
      };
    };

    const fitted = adviceFor(ceiling.budget);
    for (const { entry } of fitted) {
      if (entry.tier === 0) {
        // Kept apart from the recipe rows: a raw is shown, never ranked.
        if (entry.status === 'needs-price') rawUnpriced.add(entry.typeId);
        const isk = entry.status === 'scored' ? iskPerHourOf(entry, books, taxRate) : null;
        if (isk !== null) {
          rawRows.push({ typeId: entry.typeId, planetType, iskPerDay: isk * HOURS_PER_DAY });
        }
        continue;
      }
      if (entry.tier !== 1 && entry.tier !== 2) continue;
      if (entry.status === 'needs-price') unpriced.add(entry.typeId);
    }
    const hosted = new Set<number>();
    for (const scored of fitted.filter(isRecipeEntry)) {
      const built = rowFor(scored, null);
      if (built) recipeRows.push(built);
      hosted.add(scored.entry.typeId);
    }
    // What only a higher Command Center hosts still ranks, tagged with the
    // lowest level that does, so an untrained pilot sees what training buys.
    for (let level = ceiling.level + 1; level <= maxLevel; level += 1) {
      for (const scored of adviceFor(colonyBudget(level, pi).budget, hosted).filter(
        isRecipeEntry
      )) {
        if (hosted.has(scored.entry.typeId)) continue;
        hosted.add(scored.entry.typeId);
        const built = rowFor(scored, level);
        if (built) recipeRows.push(built);
      }
    }
  }

  const have = [
    ...new Set([...rows.map((row) => row.planetType), ...(input.whatIfTypes ?? [])]),
  ] as PlanetType[];

  const unpricedIds = [...unpriced].sort((a, b) => a - b);
  const basis: RankingBasis = {
    rateSource: measured.length > 0 ? 'measured' : 'assumed',
    ccLevel: ceiling.level,
    ccAssumed: skill === null,
    linkCost: borrowed ? 'borrowed' : 'assumed',
  };
  const rawPriced = new Set(rawRows.map((row) => row.typeId));
  return {
    rows: recipeRows,
    rawRows,
    // Priced on any planet type = priced: the market prices the item, not the planet.
    rawUnpriced: [...rawUnpriced].filter((id) => !rawPriced.has(id)),
    // With no colony every planet type is one the pilot could go and find, as in Find best.
    withTagged: rankRecipes({
      rows: recipeRows,
      haveTypes: have.length > 0 ? have : planetTypes,
      filter: input.recipeFilter,
      unpriced: unpricedIds,
    }),
    ranking: rankRecipes({
      // Plan and Map stay within the trained skill; Find best re-ranks every row.
      rows: recipeRows.filter((row) => !row.needsCcLevel),
      haveTypes: have,
      filter: input.recipeFilter,
      unpriced: unpricedIds,
    }),
    basis,
    chain: {
      ...basis,
      budget: ceiling.budget,
      newLinkCost: borrowed ?? ASSUMED_RANKING_LINK_COST,
      headsPerExtractor: heads,
      ratePerHour: rate,
      taxRate,
      books,
      haulDays: input.cadence.haulDays,
    },
  };
}
