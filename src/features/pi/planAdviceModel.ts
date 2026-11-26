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

const MAX_PLANET_SLOTS = 6;

export function planColonyAnchor(name: string | null, planetId: number): string {
  const slug = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `plan-${slug || `planet-${planetId}`}`;
}

const sharedAdvice = new WeakMap<PlanAdviceInput, { advice: PlanAdvice } | { error: unknown }>();

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
