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
 *   its nominal rate: today is the nominal figure less the stalled share, and
 *   the storage quick win gives that share back. So today plus every quick win
 *   is the colony running at full, with nothing counted twice.
 * - **Quick wins**: stopped or decayed extractors, idle factories, storage that
 *   fills early, spare room. Each is priced by re-running the same earnings
 *   model with the fix applied and taking the difference, so a quick win's
 *   figure is the colony's own earnings model's answer rather than a second
 *   one. A win whose value cannot be priced keeps a `null` gain.
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

import type { CharacterPlanet, PlanetPin } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { extractorState, EFFICIENT_WINDOW_FRACTION } from '@/engine/pi/colonyStatus';
import { hasYieldBaseline, pastEfficientWindow } from '@/engine/pi/extraction';
import { volumeOf } from '@/engine/pi/haulEffort';
import { CUSTOMS_TAXABLE_VALUE, DEFAULT_CUSTOMS_TAX_RATE, isP0 } from '@/engine/pi/chain';
import type { PlanetType } from '@/engine/pi/goalTypes';
import {
  colonyAdvice,
  HOURS_PER_DAY,
  planTotals,
  quickWin,
  sellBooks,
  slotNudge,
  orderQuickWins,
  type ColonyAdvice,
  type PlanTotals,
  type QuickWin,
  type RebuildCandidate,
  type RebuildFacts,
  type RebuildPreference,
  type SellBooks,
  type SellMarket,
  type SlotNudge,
} from '@/engine/pi/planAdvice';
import {
  haulSummary,
  type HaulColony,
  type HaulSummary,
  type RouteSystem,
} from '@/engine/pi/planHaul';
import {
  rankRecipes,
  type RecipeFilter,
  type RecipeRanking,
  type RecipeRow,
} from '@/engine/pi/planRecipes';
import {
  recommendStopTier,
  type ScoredStopTier,
  type StopTierAdvice,
  type StopTierEntry,
} from '@/engine/pi/stopTier';
import { restartCadenceYield } from '@/engine/pi/restartCadence';
import type { PinLoad } from '@/engine/pi/types';
import type { NetworkOpportunity } from '@/engine/pi/network';
import { colonyNetwork } from './networkModel';
import { dropSharedSurplus } from './factoryRoomDedupe';
import { salesTaxPct } from '@/engine/industry/fees';
import { colonyPlan } from './colonyPlan';
import { colonyBudget } from './colonyBudget';
import { type PiCadence, cadenceHours } from './cadencePref';
import { highsecCustomsRate } from './customsRate';
import { extractorProgramsFromPins } from './adapters';
import { localResourcesFor, type BuiltColonyAdvice, type PlanetAdvice } from './advisorModel';
import { builtColonyEarnings, saleableOutputPerHour } from './colonyEarningsModel';
import { colonyHoursToFull } from './colonyThroughput';
import {
  DEFAULT_PLANNER_HEADS,
  plannerColonies,
  plannerPolicy,
  type PlannerColonyRow,
  type PlannerPrefs,
  type PlannerSnapshot,
} from './goalPlannerModel';
import {
  colonyStopTierAdvice,
  currentProductTypeIds,
  meanHeadsPerExtractor,
} from './stopTierModel';
import { pinsLoad } from '@/engine/pi/pinBudget';
import { medianNewLinkLoad } from './unbuiltPlanModel';
import { planetSlots } from './planetSlots';

/** Planet slots at Interplanetary Consolidation V: 1 + 5. */
const MAX_PLANET_SLOTS = 6;

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

/** Sell prices as the loaders return them: the ask, and the hub's buy orders. */
export interface HubPrices {
  prices: Readonly<Record<number, number>>;
  buyPrices: Readonly<Record<number, number>>;
}

/**
 * The hub's books for the engine: a sale is valued at the bid, falling back to
 * the ask for a type with no buy order (the Advisor's `revenuePrices` rule), and
 * unknown Accounting prices at level 0, the highest tax.
 */
export function hubBooks(prices: HubPrices, accountingLevel: number | null): SellBooks {
  return {
    prices: prices.prices,
    revenuePrices: { ...prices.prices, ...prices.buyPrices },
    salesTaxPct: salesTaxPct(accountingLevel ?? 0),
  };
}

export interface PlanAdviceInput {
  snapshot: PlannerSnapshot;
  prefs: Pick<PlannerPrefs, 'restartHours' | 'fallbackRatePerHour' | 'customsOverrides'>;
  /** The hub's books; `market` decides whether a buyback replaces them. */
  books: SellBooks;
  market: SellMarket;
  cadence: PiCadence;
  preference: RebuildPreference;
  recipeFilter: RecipeFilter;
  /** Planet types to treat as owned for the ranking: "what if I add a Lava planet". */
  whatIfTypes?: readonly PlanetType[];
  skills: {
    /** Command Center Upgrades, effective level; null when skills never loaded. */
    commandCenterUpgrades: number | null;
    /** Interplanetary Consolidation, effective level; null when skills never loaded. */
    interplanetaryConsolidation: number | null;
  };
  /**
   * Systems from each colony's system to the sell market, origin first, with
   * their security. A missing entry is an unresolved route (unknown, not zero).
   * Ignored for a corp buyback, which is collected at home.
   */
  routesBySystem?: ReadonlyMap<number, readonly RouteSystem[] | null>;
  planetNames?: ReadonlyMap<number, string>;
}

export interface PlanColonyAdvice extends ColonyAdvice {
  name: string | null;
  /** The element id Plan gives this colony's card; `#plan-…` deep links scroll to it. */
  anchor: string;
  systemId: number;
  upgradeLevel: number;
  taxRate: number;
  /** The customs rate is a stand-in for an unknown player-office rate. */
  taxAssumed: boolean;
  /**
   * What the recommended rebuild draws against the Command Center it needs, for
   * the checklist's fit meters. Null unless the recommendation is a change.
   */
  rebuildFit: { level: number; used: PinLoad; budget: PinLoad } | null;
  /** The typeIDs the colony sells today: what a Keep card says it stays on. */
  sells: readonly number[];
}

export interface RankingBasis {
  /** Where the per-extractor rate came from. */
  rateSource: 'measured' | 'assumed';
  ccLevel: number;
  ccAssumed: boolean;
  linkCost: 'borrowed' | 'assumed';
}

export interface PlanAdvice {
  preference: RebuildPreference;
  market: SellMarket;
  colonies: PlanColonyAdvice[];
  /** Colonies left out, with the reason: no detail loaded, say. */
  excluded: { planetId: number; name: string | null; reason: 'no-detail' }[];
  /** Every colony's quick wins, best ISK per minute first. */
  quickWins: QuickWin[];
  totals: PlanTotals;
  haul: HaulSummary;
  slots: SlotNudge;
  recipes: RecipeRanking;
  /**
   * Every priced one-planet recipe on every planet type, before filtering. Plan's
   * "Find the best thing to build" re-ranks these under its own toggles and
   * what-if planets, so the figures stay this model's.
   */
  recipeRows: RecipeRow[];
  rankingBasis: RankingBasis;
}

/** `plan-hek-vi`: the stable fragment a card carries and a deep link targets. */
export function planColonyAnchor(name: string | null, planetId: number): string {
  const slug = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `plan-${slug || `planet-${planetId}`}`;
}

/** The P0s a product needs, and the factories in the order they are set (inputs first). */
export function recipeOf(typeId: number, pi: PiData): RebuildCandidate['recipe'] {
  const extracts = new Set<number>();
  const makes: { typeId: number; facility: 'basic' | 'advanced' | 'highTech' }[] = [];
  const seen = new Set<number>();
  const walk = (id: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (isP0(id, pi)) {
      extracts.add(id);
      return;
    }
    const schematic = pi.schematics[String(id)];
    if (!schematic) return;
    for (const input of schematic.inputs) walk(input.typeID);
    makes.push({ typeId: id, facility: schematic.facility });
  };
  walk(typeId);
  return { extracts: [...extracts].sort((a, b) => a - b), makes };
}

function safeVolume(typeId: number, pi: PiData): number | null {
  try {
    return volumeOf(typeId, pi);
  } catch {
    return null;
  }
}

/**
 * What a layout earns a day, absolute: units sold at the sell market, less
 * sales tax, less the colony's customs on the one export. Nothing between tiers
 * is taxed on one planet.
 *
 * `ScoredStopTier.marginPerHour` is not this. For a made tier it is net of the
 * raw P0 the layout consumes, a margin over selling the ore, and `Today`
 * (`builtColonyEarnings`) is an absolute income. Comparing a rebuild with today
 * has to be absolute against absolute, so the figure is rebuilt here from the
 * scorer's own unit rate. Null when the sell market does not price the product.
 */
function iskPerHourOf(entry: ScoredStopTier, books: SellBooks, taxRate: number): number | null {
  const price = books.revenuePrices[entry.typeId];
  if (price === undefined || !Number.isFinite(price)) return null;
  const perUnit =
    price * (1 - books.salesTaxPct / 100) - taxRate * CUSTOMS_TAXABLE_VALUE[entry.tier];
  return entry.unitsPerHour * perUnit;
}

function candidateOf(
  entry: ScoredStopTier,
  needsCcLevel: number | null,
  pi: PiData,
  iskPerHour: number,
  headsPerExtractor: number
): RebuildCandidate | null {
  const volume = safeVolume(entry.typeId, pi);
  if (volume === null) return null;
  const unitsPerDay = entry.unitsPerHour * HOURS_PER_DAY;
  return {
    typeId: entry.typeId,
    name: entry.name,
    tier: entry.tier,
    iskPerDay: iskPerHour * HOURS_PER_DAY,
    m3PerDay: unitsPerDay * volume,
    unitsPerDay,
    pins: entry.pins,
    recipe: recipeOf(entry.typeId, pi),
    needsCcLevel,
    load: pinsLoad(entry.pins, pi.infrastructure, {
      extractorHeads: (entry.pins.extractorControlUnit ?? 0) * headsPerExtractor,
    }),
  };
}

/** Scored P1 and P2 candidates: one-planet recipes only, never raw P0. */
function recipeEntries(advice: StopTierAdvice): ScoredStopTier[] {
  const entries: readonly StopTierEntry[] = advice.entries;
  return entries
    .filter((entry): entry is ScoredStopTier => entry.status === 'scored')
    .filter((entry) => entry.tier === 1 || entry.tier === 2);
}

function hostsTier2(advice: StopTierAdvice): boolean {
  return advice.entries.some((entry) => entry.tier === 2 && entry.status !== 'does-not-fit');
}

function sellsOf(colony: BuiltColonyAdvice, pi: PiData): number[] {
  const made = currentProductTypeIds(colony, pi);
  return made.length > 0 ? [...new Set(made)] : colony.extractedPerHour.map((e) => e.typeId);
}

function rebuildFitOf(
  advice: ColonyAdvice,
  upgradeLevel: number,
  pi: PiData
): PlanColonyAdvice['rebuildFit'] {
  if (advice.rebuild.status !== 'change') return null;
  const { load, needsCcLevel } = advice.rebuild.pick;
  if (!load) return null;
  const { level, budget } = colonyBudget(Math.max(upgradeLevel, needsCcLevel ?? 0), pi);
  return { level, used: load, budget };
}

interface ColonyWork {
  advice: ColonyAdvice;
  /** What the colony sells today: its factories' products, else the raw it extracts. */
  sells: number[];
  m3PerDay: number | null;
  todayM3PerDay: number | null;
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
    recipeRows: ranking.rows,
    rankingBasis: ranking.basis,
  };
}

// --- One colony ---------------------------------------------------------------

function analyseColony(args: {
  row: PlannerColonyRow & { advice: BuiltColonyAdvice };
  pins: readonly PlanetPin[];
  books: SellBooks;
  pi: PiData;
  nowMs: number;
  restartHours: number;
  haulHours: number;
  preference: RebuildPreference;
  ccSkill: number | null;
  factoryWins: readonly QuickWin[];
}): ColonyWork {
  const { row, pins, books, pi, nowMs, restartHours, haulHours, preference } = args;
  const colony = row.advice;
  const planetId = row.planetId;
  const earnOpts = {
    prices: books.prices,
    revenuePrices: books.revenuePrices,
    taxRate: row.taxRate,
    salesTaxPct: books.salesTaxPct,
  };

  // Every extractor stopped is a colony earning nothing, which is a
  // measurement, not an unknown.
  const allStopped =
    colony.extractors.length > 0 &&
    colony.stoppedExtraction !== null &&
    colony.stoppedExtraction.count >= colony.extractors.length;

  const earningsOf = (a: BuiltColonyAdvice) => builtColonyEarnings(a, pi, earnOpts);
  const baseEarnings = earningsOf(colony);
  const nominalPerHour: number | null = allStopped ? 0 : baseEarnings.iskPerHour;
  // A figure that leaves a product out because the hub does not price it is not
  // today's income, it is part of it.
  const unknownReason =
    nominalPerHour === null
      ? 'no-measured-extraction'
      : !allStopped && baseEarnings.unpriced.length > 0
        ? 'unpriced'
        : null;
  const nominal = unknownReason === null ? nominalPerHour : null;

  /** What the colony would earn per hour with extra P0 an hour of each type. */
  const earnWith = (extra: ReadonlyMap<number, number>): number | null => {
    if (extra.size === 0) return nominal;
    const merged = new Map(colony.extractedPerHour.map((l) => [l.typeId, l.unitsPerHour]));
    for (const [typeId, units] of extra) merged.set(typeId, (merged.get(typeId) ?? 0) + units);
    const result = earningsOf({
      ...colony,
      extractedPerHour: [...merged].map(([typeId, unitsPerHour]) => ({ typeId, unitsPerHour })),
      stoppedExtraction: null,
    });
    return result.unpriced.length > 0 ? null : result.iskPerHour;
  };
  const gainPerDay = (after: number | null, before: number | null): number | null =>
    after === null || before === null ? null : (after - before) * HOURS_PER_DAY;
  const real = (gain: number | null): boolean => gain === null || gain > 0;

  const wins: QuickWin[] = [];

  // Restart: stopped extractors first, then decayed ones, each priced on top of the last.
  const programs = new Map(extractorProgramsFromPins(pins).map((p) => [p.pinId, p]));
  const stoppedAdd = new Map<number, number>();
  const decayedAdd = new Map<number, number>();
  const stoppedResources = new Set<number>();
  const decayedResources = new Set<number>();
  let stoppedCount = 0;
  let decayedCount = 0;
  for (const extractor of colony.extractors) {
    const program = programs.get(extractor.pinId);
    if (!program || !hasYieldBaseline(program) || extractor.productTypeId === null) continue;
    const restartRate = restartCadenceYield({ program, cadences: [restartHours] })[0]?.unitsPerHour;
    if (restartRate === undefined || !(restartRate > 0)) continue;
    const product = extractor.productTypeId;
    if (extractor.expiryMs !== null && extractorState(extractor.expiryMs, nowMs) === 'expired') {
      stoppedAdd.set(product, (stoppedAdd.get(product) ?? 0) + restartRate);
      stoppedResources.add(product);
      stoppedCount += 1;
    } else if (
      extractor.ratePerHour !== null &&
      restartRate > extractor.ratePerHour &&
      pastEfficientWindow(program, nowMs, EFFICIENT_WINDOW_FRACTION)
    ) {
      decayedAdd.set(product, (decayedAdd.get(product) ?? 0) + restartRate - extractor.ratePerHour);
      decayedResources.add(product);
      decayedCount += 1;
    }
  }
  const afterStopped = stoppedCount > 0 ? earnWith(stoppedAdd) : nominal;
  if (stoppedCount > 0) {
    const gain = gainPerDay(afterStopped, nominal);
    if (real(gain)) {
      wins.push(
        quickWin(
          planetId,
          {
            kind: 'restart',
            reason: 'stopped',
            extractors: stoppedCount,
            resourceTypeIds: [...stoppedResources].sort((a, b) => a - b),
          },
          gain
        )
      );
    }
  }
  if (decayedCount > 0) {
    const both = new Map(stoppedAdd);
    for (const [typeId, units] of decayedAdd) both.set(typeId, (both.get(typeId) ?? 0) + units);
    const gain = gainPerDay(earnWith(both), afterStopped);
    if (real(gain)) {
      wins.push(
        quickWin(
          planetId,
          {
            kind: 'restart',
            reason: 'decayed',
            extractors: decayedCount,
            resourceTypeIds: [...decayedResources].sort((a, b) => a - b),
          },
          gain
        )
      );
    }
  }

  // Storage that fills before the pilot's haul: extraction stalls for the rest of the window.
  const hoursToFull = colonyHoursToFull(colony, pins, pi, haulHours);
  const stall =
    hoursToFull !== null && hoursToFull < haulHours ? 1 - Math.max(0, hoursToFull) / haulHours : 0;
  if (hoursToFull !== null && stall > 0) {
    const gain = nominal === null ? null : nominal * stall * HOURS_PER_DAY;
    if (real(gain)) {
      wins.push(quickWin(planetId, { kind: 'storage', hoursToFull, haulHours }, gain));
    }
  }

  // Idle factories, and the heads that would feed them.
  const plan = colonyPlan(colony, pi);
  if (plan.idle) {
    const { idle } = plan;
    const pinCount = idle.lines.reduce((sum, line) => sum + line.line.surplusPins, 0);
    const freed = idle.lines.reduce(
      (sum, line) => ({
        cpu: sum.cpu + line.freed.cpu,
        powergrid: sum.powergrid + line.freed.powergrid,
      }),
      { cpu: 0, powergrid: 0 }
    );
    const shortfall = idle.lines.find((line) => line.gap !== null)?.gap ?? null;
    const feeds =
      (idle.upgrade.status === 'fits' || idle.upgrade.status === 'needs-removal') &&
      idle.upgrade.heads > 0 &&
      idle.wouldFeed > 0 &&
      shortfall !== null;
    // Only a P0 the colony already extracts can be topped up by more heads.
    const extractsIt =
      shortfall !== null && colony.extractedPerHour.some((l) => l.typeId === shortfall.typeId);
    const gain =
      feeds && extractsIt
        ? gainPerDay(earnWith(new Map([[shortfall.typeId, idle.upgrade.extraPerHour]])), nominal)
        : null;
    if (real(gain)) {
      wins.push(
        quickWin(
          planetId,
          {
            kind: 'idle-factories',
            pinCount,
            freed,
            wouldFeed: idle.wouldFeed,
            headsToAdd: feeds ? idle.upgrade.heads : null,
            resourceTypeId: shortfall?.typeId ?? null,
          },
          gain
        )
      );
    }
  }

  // Spare room for more extractors. Priced only for a colony on one resource:
  // with two, no figure says which one a new ECU would pull.
  const ecus = colony.pinLoad.counts.extractorControlUnit ?? 0;
  const room = plan.headroom.extractorControlUnit ?? 0;
  const maxEcus = plannerPolicy({ maxP0Types: 1, buyTiers: [] }).maxEcusPerColony;
  const extraEcus = Math.min(room, Math.max(0, maxEcus - ecus));
  // Extra heads for idle factories and extra ECUs draw on the same CPU/Powergrid
  // headroom, so when the idle win already buys heads, this one would count it twice.
  const headroomSpent = wins.some(
    (win) => win.detail.kind === 'idle-factories' && win.detail.headsToAdd !== null
  );
  if (extraEcus > 0 && ecus > 0 && colony.extractedPerHour.length === 1 && !headroomSpent) {
    const only = colony.extractedPerHour[0];
    const perEcu = only.unitsPerHour / ecus;
    // The same flat falloff the rebuild scorer applies to every ECU after the first.
    const extra =
      perEcu * extraEcus * plannerPolicy({ maxP0Types: 1, buyTiers: [] }).extraEcuFactor;
    const gain = gainPerDay(earnWith(new Map([[only.typeId, extra]])), nominal);
    if (gain !== null && gain > 0) {
      wins.push(
        quickWin(
          planetId,
          { kind: 'spare-room', what: 'extractors', extraEcus, resourceTypeId: only.typeId },
          gain
        )
      );
    }
  }

  wins.push(...args.factoryWins.map((win) => ({ ...win, planetId })));

  // Today is what the colony actually delivers: nominal less the stalled share.
  const todayPerDay = nominal === null ? null : nominal * (1 - stall) * HOURS_PER_DAY;

  // Today's m3 a day: what the colony ships out as it runs now.
  const outputUnits = saleableOutputPerHour(colony, pi);
  let todayM3PerDay: number | null = null;
  if (nominal !== null) {
    let sum = 0;
    let ok = true;
    for (const [typeId, units] of outputUnits) {
      const volume = safeVolume(typeId, pi);
      if (volume === null) ok = false;
      else sum += units * volume * HOURS_PER_DAY;
    }
    todayM3PerDay = ok ? sum * (1 - stall) : null;
  }

  const rebuild = rebuildFacts({
    row,
    colony,
    pi,
    books,
    haulHours,
    ccSkill: args.ccSkill,
    todayM3PerDay,
  });

  return {
    advice: colonyAdvice({
      planetId,
      planetType: row.planetType,
      todayPerDay,
      ...(unknownReason ? { unknownReason } : {}),
      quickWins: wins,
      rebuild,
      preference,
    }),
    sells: sellsOf(colony, pi),
    m3PerDay: todayM3PerDay,
    todayM3PerDay,
  };
}

function rebuildFacts(args: {
  row: PlannerColonyRow;
  colony: BuiltColonyAdvice;
  pi: PiData;
  books: SellBooks;
  haulHours: number;
  ccSkill: number | null;
  todayM3PerDay: number | null;
}): RebuildFacts | { refused: string } {
  const { row, colony, pi, books, haulHours } = args;
  const scoreAt = (budgetOverride?: PinLoad) =>
    colonyStopTierAdvice({
      colony,
      planetType: row.planetType,
      pi,
      prices: books.prices,
      revenuePrices: books.revenuePrices,
      taxRate: row.taxRate,
      salesTaxPct: books.salesTaxPct,
      bufferHours: haulHours,
      ...(budgetOverride ? { budgetOverride } : {}),
    });

  const heads = meanHeadsPerExtractor(colony);
  const own = scoreAt();
  if (own.status !== 'advised') return { refused: own.status };

  const candidates = new Map<number, RebuildCandidate>();
  for (const entry of recipeEntries(own.advice)) {
    const isk = iskPerHourOf(entry, books, row.taxRate);
    const candidate = isk === null ? null : candidateOf(entry, null, pi, isk, heads);
    if (candidate) candidates.set(candidate.typeId, candidate);
  }

  // What a higher Command Center would host, within the pilot's trained skill.
  // Each recipe is scored at the lowest level that hosts it.
  const reach = args.ccSkill === null ? 0 : colonyBudget(args.ccSkill, pi).level;
  for (let level = row.upgradeLevel + 1; level <= reach; level += 1) {
    const higher = scoreAt(colonyBudget(level, pi).budget);
    if (higher.status !== 'advised') break;
    for (const entry of recipeEntries(higher.advice)) {
      if (candidates.has(entry.typeId)) continue;
      const isk = iskPerHourOf(entry, books, row.taxRate);
      const candidate = isk === null ? null : candidateOf(entry, level, pi, isk, heads);
      if (candidate) candidates.set(candidate.typeId, candidate);
    }
  }

  return {
    planetId: row.planetId,
    planetType: row.planetType,
    colonyCcLevel: row.upgradeLevel,
    currentProductTypeIds: currentProductTypeIds(colony, pi),
    currentPins: colony.pinLoad.counts,
    todayM3PerDay: args.todayM3PerDay,
    candidates: [...candidates.values()],
  };
}

// --- Factory room across colonies ------------------------------------------------

/**
 * Factories a colony has the room for and the surplus P1 to feed, from the
 * network plan: the Advisor's own detector for "room for factories", reused.
 * The plan only offers a P2 no single colony already makes both inputs for
 * (that one is the rebuild scorer's question), so an opportunity usually draws
 * on another colony's surplus: `routedFrom` names those colonies so the page can
 * say what to move. Market sourcing is off, so nothing here is a purchase. The
 * network plan needs two measurable colonies.
 */
function factoryRoom(
  built: readonly (PlannerColonyRow & { advice: BuiltColonyAdvice })[],
  books: SellBooks,
  planetNames: ReadonlyMap<number, string> | undefined,
  pi: PiData
): Map<number, QuickWin[]> {
  const out = new Map<number, QuickWin[]>();
  const advice: PlanetAdvice[] = built.map((row) => ({
    kind: 'built',
    planetId: row.planetId,
    name: planetNames?.get(row.planetId) ?? null,
    planetType: row.planetType as CharacterPlanet['planet_type'],
    colony: row.advice,
  }));
  const network = colonyNetwork({
    advice,
    pi,
    prices: books.prices,
    revenuePrices: books.revenuePrices,
    allowMarketSourcing: false,
    taxRateByPlanet: new Map(built.map((row) => [row.planetId, row.taxRate])),
    taxRate: built.length > 0 ? built[0].taxRate : DEFAULT_CUSTOMS_TAX_RATE,
    salesTaxPct: books.salesTaxPct,
  });
  if (!network) return out;
  const hasIdle = new Map(
    built.map((row) => [row.planetId, colonyPlan(row.advice, pi).idle !== null])
  );
  const byHost = new Map<number, NetworkOpportunity[]>();
  for (const opportunity of network.plan.opportunities) {
    const group = byHost.get(opportunity.hostPlanetId) ?? [];
    group.push(opportunity);
    byHost.set(opportunity.hostPlanetId, group);
  }
  const opportunities = [...byHost.values()].flatMap((group) => dropSharedSurplus(group));
  for (const opportunity of opportunities) {
    const gain = opportunity.marginPerHour * HOURS_PER_DAY;
    if (!(gain > 0)) continue;
    const wins = out.get(opportunity.hostPlanetId) ?? [];
    wins.push(
      quickWin(
        opportunity.hostPlanetId,
        {
          kind: 'spare-room',
          what: 'factories',
          productTypeId: opportunity.typeId,
          factories: opportunity.factories,
          routedFrom: [
            ...new Set(
              opportunity.inputs.flatMap((input) =>
                input.source === 'routed' && input.fromPlanetId !== null ? [input.fromPlanetId] : []
              )
            ),
          ].sort((a, b) => a - b),
          needsRemoval: hasIdle.get(opportunity.hostPlanetId) ?? false,
        },
        gain
      )
    );
    out.set(opportunity.hostPlanetId, wins);
  }
  return out;
}

// --- Recipe ranking ------------------------------------------------------------

/**
 * Every one-planet recipe on every planet type, valued the way a planet the
 * pilot has not built yet would be: at their own measured extraction rate
 * (else the typed fallback), their Command Center level, and a link cost
 * borrowed from their colonies (else a stated default). `rankingBasis` carries
 * which of those were assumed, so the page can badge the figures as estimates.
 */
function rankingFor(args: {
  input: PlanAdviceInput;
  rows: readonly PlannerColonyRow[];
  books: SellBooks;
  pi: PiData;
  haulHours: number;
}): { ranking: RecipeRanking; rows: RecipeRow[]; basis: RankingBasis } {
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
  for (const planetType of planetTypes) {
    const adviceAt = (headsPerExtractor: number) =>
      recommendStopTier(
        {
          localResources: localResourcesFor(planetType, pi).map((resource) => resource.typeID),
          budget: ceiling.budget,
          infrastructure: pi.infrastructure,
          overhead: { launchpads: 1, storageFacilities: storage },
          headsPerExtractor,
          newLinkCost: borrowed ?? ASSUMED_RANKING_LINK_COST,
          extractionRatePerHour: rate,
          prices: books.prices,
          revenuePrices: books.revenuePrices,
          taxRate,
          salesTaxPct: books.salesTaxPct,
          linkCapacityPerHour: null,
          bufferHours: haulHours,
        },
        pi
      );
    // An assumed head count must not decide what a planet can host: ten heads
    // on each of a P2's two extractors overdraws even a level-5 Command Center's
    // powergrid, so a pilot with no colonies would see no P2 at all. Step the
    // assumption down until a P2 block fits; a measured count is never touched.
    let advice = adviceAt(heads);
    if (!headsMeasured) {
      for (let tryHeads = heads - 2; tryHeads >= 1 && !hostsTier2(advice); tryHeads -= 2) {
        advice = adviceAt(tryHeads);
      }
    }
    for (const entry of advice.entries) {
      if (entry.tier !== 1 && entry.tier !== 2) continue;
      if (entry.status === 'needs-price') unpriced.add(entry.typeId);
    }
    for (const entry of recipeEntries(advice)) {
      const volume = safeVolume(entry.typeId, pi);
      const isk = iskPerHourOf(entry, books, taxRate);
      if (volume === null || isk === null) continue;
      recipeRows.push({
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
        },
      });
    }
  }

  const have = [
    ...new Set([...rows.map((row) => row.planetType), ...(input.whatIfTypes ?? [])]),
  ] as PlanetType[];

  return {
    rows: recipeRows,
    ranking: rankRecipes({
      rows: recipeRows,
      haveTypes: have,
      filter: input.recipeFilter,
      unpriced: [...unpriced].sort((a, b) => a - b),
    }),
    basis: {
      rateSource: measured.length > 0 ? 'measured' : 'assumed',
      ccLevel: ceiling.level,
      ccAssumed: skill === null,
      linkCost: borrowed ? 'borrowed' : 'assumed',
    },
  };
}
