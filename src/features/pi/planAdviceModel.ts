/**
 * The Plan tab's recommendation model, built from the PI snapshot.
 *
 * `engine/pi/planAdvice.ts`, `planHaul.ts` and `planRecipes.ts` decide; this is
 * the adapter that feeds them from ESI colonies, the SDE and the pilot's prefs,
 * reusing the detectors the Advisor already has rather than writing second
 * ones. It never fetches: the snapshot, prices and resolved routes are
 * parameters, so a pref change recomputes without a refetch.
 *
 * ## One number model
 *
 * Plan, Map and Colonies all read `buildPlanAdvice`, so the same input gives
 * the same figures on every tab. Every ISK figure is **ISK a day, after
 * customs, at the sell market**: the engine's per-hour figures are multiplied
 * by `HOURS_PER_DAY` here and nowhere else.
 *
 * ## Where each piece comes from
 *
 * - **Today**: `builtColonyEarnings` at the colony's own customs rate
 *   (`plannerColonies`, so overrides and the unknown-rate assumption apply),
 *   not `colonyBaseline`, which is a modelled best P1 rather than measured
 *   income. A colony whose storage fills before the pilot's haul does not earn
 *   its nominal rate: today is the nominal figure less the stalled share. The
 *   storage quick win shows that share as a saving and no total adds it
 *   (decision 20261006-094549).
 * - **Quick wins**: stopped or decayed extractors, idle factories, storage that
 *   fills early, spare room. Each is priced by re-running the same earnings
 *   model with the fix applied and taking the difference, so a quick win's
 *   figure is the colony's own earnings model's answer rather than a second
 *   one. A win whose value cannot be priced keeps a `null` gain. A colony's
 *   spare and freed room is spent by one win only (`spendRoomOnce`).
 * - **Rebuild**: `colonyStopTierAdvice`, the one-planet scorer, not `planBest`:
 *   `planBest` hosts a multi-planet goal chain, while this question is "what is
 *   the best one planet can make from its own ground". Its candidate list is
 *   filtered to P1 and P2 and re-picked by the engine under the pilot's
 *   preference. A recipe that only fits at a higher Command Center level is
 *   scored at the lowest level that hosts it, within the pilot's trained skill.
 * - **Recipes** for planets the pilot may not have: the same scorer on a
 *   hypothetical planet of each type (`rankingBasis` says what that assumed).
 * - **Sell market**: one price-book transform (`sellBooks`) applied before any
 *   of the above, so every figure moves together.
 */

import { orderQuickWins, planTotals, sellBooks, slotNudge } from '@/engine/pi/planAdvice';
import { haulSummary, type HaulColony } from '@/engine/pi/planHaul';
import type { BuiltColonyAdvice } from './systemPlanetModel';
import { cadenceHours } from './cadenceHours';
import { goalPlannerInput, plannerColonies, type PlannerColonyRow } from './goalPlannerModel';
import { planetSlots } from './planetSlotsModel';
import { analyseColony } from './planAdvice/analyseColony';
import { factoryRoom } from './planAdvice/factoryRoom';
import { rankingFor } from './planAdvice/ranking';
import { rebuildFitOf } from './planAdvice/rebuild';
import type { ColonyWork, PlanAdvice, PlanAdviceInput, PlanColonyAdvice } from './planAdvice/types';

export { ASSUMED_RANKING_CC_LEVEL, ASSUMED_RANKING_LINK_COST } from './planAdvice/ranking';
export { hubBooks, type HubPrices } from './planAdvice/hubBooks';
export { recipeOf } from './planAdvice/rebuild';
export type {
  PlanAdvice,
  PlanAdviceInput,
  PlanColonyAdvice,
  RankingBasis,
  RawRow,
} from './planAdvice/types';

/** Planet slots at Interplanetary Consolidation V: 1 + 5. */
const MAX_PLANET_SLOTS = 6;

/** `plan-hek-vi`: the stable fragment a card carries and a deep link targets. */
export function planColonyAnchor(name: string | null, planetId: number): string {
  const slug = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `plan-${slug || `planet-${planetId}`}`;
}

const sharedAdvice = new WeakMap<PlanAdviceInput, { advice: PlanAdvice } | { error: unknown }>();

/**
 * `buildPlanAdvice`, remembered per input object: the PI tabs share their inputs
 * (`PiAdviceInputsProvider`), so a tab switch reuses the model run instead of
 * repeating it. A throw is remembered too and rethrown.
 */
export function buildSharedPlanAdvice(input: PlanAdviceInput): PlanAdvice {
  let hit = sharedAdvice.get(input);
  if (!hit) {
    try {
      hit = { advice: buildPlanAdvice(input) };
    } catch (error) {
      hit = { error };
    }
    sharedAdvice.set(input, hit);
  }
  if ('error' in hit) throw hit.error;
  return hit.advice;
}

export function buildPlanAdvice(input: PlanAdviceInput): PlanAdvice {
  const { snapshot, preference } = input;
  const { pi, nowMs } = snapshot;
  const books = sellBooks(input.books, input.market);
  const { restartHours, haulHours } = cadenceHours(input.cadence);

  const rows = plannerColonies(snapshot, { ...input.prefs, disabled: new Set() });
  const built = rows.filter(
    (row): row is PlannerColonyRow & { advice: BuiltColonyAdvice } => row.advice !== null
  );

  // The network plan's factory room, priced across the whole set of colonies.
  const factoryOpportunities = factoryRoom(built, books, input.planetNames, pi);

  const excluded: PlanAdvice['excluded'] = rows
    .filter((row) => row.advice === null)
    .map((row) => ({
      planetId: row.planetId,
      name: input.planetNames?.get(row.planetId) ?? null,
      reason: 'no-detail' as const,
    }));

  const work = new Map<number, ColonyWork>();
  const colonies: PlanColonyAdvice[] = built.map((row) => {
    const name = input.planetNames?.get(row.planetId) ?? null;
    const result = analyseColony({
      row,
      pins: snapshot.details.get(row.planetId)?.pins ?? [],
      books,
      pi,
      nowMs,
      restartHours,
      haulHours,
      preference,
      ccSkill: input.skills.commandCenterUpgrades,
      picked: input.prefs.richness?.get(row.planetId),
      factoryWins: factoryOpportunities.get(row.planetId) ?? [],
    });
    work.set(row.planetId, result);
    return {
      ...result.advice,
      name,
      anchor: planColonyAnchor(name, row.planetId),
      systemId: row.systemId,
      upgradeLevel: row.upgradeLevel,
      taxRate: row.taxRate,
      taxAssumed: row.taxAssumed,
      rebuildFit: rebuildFitOf(result.advice, row.upgradeLevel, pi),
      sells: result.sells,
    };
  });

  // Two names can slug alike; a duplicate id would send a deep link to the wrong card.
  const anchors = new Set<string>();
  for (const colony of colonies) {
    if (anchors.has(colony.anchor)) colony.anchor = `${colony.anchor}-${colony.planetId}`;
    anchors.add(colony.anchor);
  }

  const haulColonies: HaulColony[] = colonies.map((colony) => {
    const w = work.get(colony.planetId)!;
    const rebuilt = colony.rebuild.status === 'change' ? colony.rebuild.pick.m3PerDay : null;
    return {
      planetId: colony.planetId,
      m3PerDay: rebuilt ?? w.m3PerDay,
      todayM3PerDay: w.todayM3PerDay,
      route:
        input.market.kind === 'buyback'
          ? 'local'
          : (input.routesBySystem?.get(colony.systemId) ?? null),
    };
  });

  const ranking = rankingFor({ input, rows, books, pi, haulHours });
  const slots = planetSlots(input.skills.interplanetaryConsolidation);

  return {
    preference,
    market: input.market,
    colonies,
    excluded,
    quickWins: orderQuickWins(colonies.flatMap((colony) => colony.quickWins)),
    totals: planTotals(colonies),
    haul: haulSummary({
      haulDays: input.cadence.haulDays,
      restartDays: input.cadence.restartDays,
      colonies: haulColonies,
    }),
    slots: slotNudge({
      used: snapshot.colonies.length,
      allowed: slots.slots,
      maxSlots: MAX_PLANET_SLOTS,
      assumed: slots.assumed,
      bestOnePlanetGainPerDay: ranking.ranking.bestAnywherePerDay,
    }),
    recipes: ranking.ranking,
    recipesWithTagged: ranking.withTagged,
    recipeRows: ranking.rows,
    rawRows: ranking.rawRows,
    rawUnpriced: ranking.rawUnpriced,
    rankingBasis: ranking.basis,
    chainBasis: ranking.chain,
    chainColonies: goalPlannerInput(rows),
  };
}
