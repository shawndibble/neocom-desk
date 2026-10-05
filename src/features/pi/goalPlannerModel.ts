/**
 * The Goal Planner's adapter: the active Character's ESI colonies, the SDE
 * and the pilot's prefs in, the engine's `PlannerColony[]` out — plus the two
 * readings the engine leaves to its caller (hauling split out/in, and the
 * plain verdict).
 *
 * ## Why a new loader, not the Advisor's
 *
 * `AdvisorPanel` keeps a private snapshot loader that also reads every system's
 * planet list, every unbuilt planet's type and the alt roster — none of which
 * the planner uses — and its behaviour is pinned by a 1,700-line test. Moving
 * it out to share would put that at risk for nothing the planner needs, so
 * `goalPlannerSnapshot.ts` is a slim loader over the *same* lower-level reads
 * (`loadCharacterPlanets`, `loadAllColonyDetails`, `loadSystemSecurity`,
 * `loadCustomsCodeExpertise`, `loadPlanPrices` ...). Both tabs therefore see
 * the same cached ESI. This module never fetches: the snapshot is a
 * parameter, and the prefs are applied here rather than in the loader so a
 * pref change recomputes without refetching.
 *
 * ## Each colony's facts, strongest source first
 *
 * - **Rate per ECU, per P0** (`ratePerEcu`): this colony's own program for that
 *   P0 re-projected at the pilot's restart cadence (`restartCadenceYield`) —
 *   per program, so two ECUs on one resource read as two samples, not a sum;
 *   else the mean of every program the pilot runs (`own-mean`); else the
 *   pilot's typed fallback (`assumed`). Keyed on exactly the P0s the planet
 *   type yields (`localResourcesFor`) — a P0 the planet cannot yield is
 *   absent, never zero.
 * - **Heads per ECU**: the colony's own mean when it runs ECUs. A colony with
 *   none would read 1 off `meanHeadsPerExtractor`, which undercharges exactly
 *   the colonies a plan re-targets, so it takes the pilot's own mean instead,
 *   else `DEFAULT_PLANNER_HEADS` — flagged `headsAssumed` either way.
 * - **Link cost**: the colony's own longest hop (`colonyPinLoad.newLinkLoad`),
 *   else the median of the pilot's other colonies (`linkCostBorrowed`), else
 *   the colony is excluded — fitting at a free link would overstate what fits.
 * - **Customs**: the pilot's per-system override, else the band default after
 *   Customs Code Expertise. Outside highsec that default is 0% only because a
 *   player office's rate is unknowable, so the row says `rateUnknown` and the
 *   plan is costed at `ASSUMED_UNKNOWN_CUSTOMS` (`taxAssumed`) until the pilot
 *   sets one — a 0% placeholder made unknown-rate colonies the cheapest hosts.
 *
 * Pure: no fetch, no Dexie, no clock.
 */
import type { PiData } from '@/sde/types';
import type { CharacterPlanet, CharacterPlanetDetail } from '@/esi/endpoints';
import type {
  EcuRate,
  HaulEffort,
  GoalPlan,
  PlannerColony,
  PlannerPolicy,
  PriceBooks,
} from '@/engine/pi/goalTypes';
import type { BaselineTotal } from '@/engine/pi/baseline';
import type { PinLoad } from '@/engine/pi/types';
import { restartCadenceYield } from '@/engine/pi/restartCadence';
import { DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR } from '@/engine/pi/stopTier';
import { salesTaxPct } from '@/engine/industry/fees';
import { builtAdvice, localResourcesFor, type BuiltColonyAdvice } from './advisorModel';
import { extractorProgramsFromPins } from './adapters';
import { currentProductTypeIds, meanHeadsPerExtractor } from './stopTierModel';
import { medianNewLinkLoad } from './unbuiltPlanModel';
import {
  builtColonyEarnings,
  totalColonyEarnings,
  type TotalColonyEarnings,
} from './colonyEarningsModel';
import {
  colonySpaceFor,
  customsRateSource,
  defaultCustomsRate,
  type CustomsRateSource,
} from './customsRate';
import { customsRateFor, type CustomsOverrides } from './customsOverride';

/**
 * What an unknown player-office rate is costed at: the untrained highsec NPC
 * rate, a common owner tax and the conservative direction (never 0%).
 */
export const ASSUMED_UNKNOWN_CUSTOMS = 0.1;

/** Heads per ECU when the pilot runs no extractor at all to read one off. */
export const DEFAULT_PLANNER_HEADS = 10;

/** What the loader hands over: ESI and SDE facts only, no prefs. */
export interface PlannerSnapshot {
  pi: PiData;
  nowMs: number;
  colonies: readonly CharacterPlanet[];
  /** A missing entry is a detail that did not load. */
  details: ReadonlyMap<number, CharacterPlanetDetail>;
  planetRadiusKm: ReadonlyMap<number, number>;
  /** Null where the system's security did not resolve (read as highsec). */
  securityBySystem: ReadonlyMap<number, number | null>;
  /** Customs Code Expertise; null when the character's skills never loaded. */
  customsSkill: number | null;
}

export interface PlannerPrefs {
  restartHours: number;
  /** P0/h one ECU yields when nothing the pilot runs is measured. */
  fallbackRatePerHour: number;
  customsOverrides: CustomsOverrides;
  /** Planet ids the pilot switched off. */
  disabled: ReadonlySet<number>;
}

export type ExcludedReason = 'no-detail' | 'no-planet-type' | 'no-link-cost';

export interface PlannerColonyRow {
  planetId: number;
  systemId: number;
  upgradeLevel: number;
  planetType: CharacterPlanet['planet_type'];
  /** In the plan: not switched off and not excluded. */
  enabled: boolean;
  /** Null exactly when `excluded` is set. */
  colony: PlannerColony | null;
  excluded: ExcludedReason | null;
  /** Today's colony as the Advisor reads it, for "what it earns now". Null without detail. */
  advice: BuiltColonyAdvice | null;
  taxRate: number;
  taxSource: CustomsRateSource;
  taxOverridden: boolean;
  /** Outside highsec with no override: the band's 0% is a placeholder, not a reading. */
  rateUnknown: boolean;
  /** `taxRate` is `ASSUMED_UNKNOWN_CUSTOMS`, standing in for an unknown rate. */
  taxAssumed: boolean;
  headsAssumed: boolean;
  linkCostBorrowed: boolean;
}

/** Per-ECU rate of each of these pins' programs at the cadence, by P0. Programs with no baseline are skipped. */
function programRatesByP0(
  detail: CharacterPlanetDetail,
  restartHours: number
): Map<number, number[]> {
  const productByPin = new Map<number, number>();
  for (const pin of detail.pins) {
    const product = pin.extractor_details?.product_type_id;
    if (product !== undefined) productByPin.set(pin.pin_id, product);
  }
  const out = new Map<number, number[]>();
  for (const program of extractorProgramsFromPins(detail.pins)) {
    const product = productByPin.get(program.pinId);
    if (product === undefined) continue;
    const rate = restartCadenceYield({ program, cadences: [restartHours] })[0]?.unitsPerHour;
    if (rate === undefined || !Number.isFinite(rate) || rate <= 0) continue;
    const list = out.get(product) ?? [];
    list.push(rate);
    out.set(product, list);
  }
  return out;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function plannerColonies(
  snapshot: PlannerSnapshot,
  prefs: PlannerPrefs
): PlannerColonyRow[] {
  const { pi, nowMs } = snapshot;

  const advice = new Map<number, BuiltColonyAdvice>();
  const measured = new Map<number, Map<number, number[]>>();
  for (const planet of snapshot.colonies) {
    const detail = snapshot.details.get(planet.planet_id);
    if (!detail) continue;
    advice.set(
      planet.planet_id,
      builtAdvice(planet, detail, pi, snapshot.planetRadiusKm.get(planet.planet_id) ?? null, nowMs)
    );
    measured.set(planet.planet_id, programRatesByP0(detail, prefs.restartHours));
  }

  const ownMean = mean([...measured.values()].flatMap((byP0) => [...byP0.values()].flat()));
  const withEcus = [...advice.values()].filter(
    (a) => (a.pinLoad.counts.extractorControlUnit ?? 0) > 0
  );
  const pilotHeads =
    withEcus.length > 0 ? Math.round(mean(withEcus.map(meanHeadsPerExtractor))!) : null;
  const borrowedLink = medianNewLinkLoad(
    [...advice.values()].flatMap((a) => (a.pinLoad.newLinkLoad ? [a.pinLoad.newLinkLoad] : []))
  );

  return snapshot.colonies.map((planet): PlannerColonyRow => {
    const planetId = planet.planet_id;
    const systemId = planet.solar_system_id;
    const space = colonySpaceFor(snapshot.securityBySystem.get(systemId) ?? null);
    const derived = defaultCustomsRate(space, snapshot.customsSkill);
    const taxOverridden = prefs.customsOverrides[systemId] !== undefined;
    const rateUnknown = space !== 'highsec' && !taxOverridden;
    const taxRate = rateUnknown
      ? ASSUMED_UNKNOWN_CUSTOMS
      : customsRateFor(systemId, prefs.customsOverrides, derived);
    const own = advice.get(planetId) ?? null;
    const base = {
      planetId,
      systemId,
      upgradeLevel: planet.upgrade_level,
      planetType: planet.planet_type,
      advice: own,
      taxRate,
      taxSource: customsRateSource(space, snapshot.customsSkill),
      taxOverridden,
      rateUnknown,
      taxAssumed: rateUnknown,
    };
    const excluded = (reason: ExcludedReason): PlannerColonyRow => ({
      ...base,
      enabled: false,
      colony: null,
      excluded: reason,
      headsAssumed: false,
      linkCostBorrowed: false,
    });

    if (!own) return excluded('no-detail');
    const local = localResourcesFor(planet.planet_type, pi);
    if (local.length === 0) return excluded('no-planet-type');
    const newLinkCost: PinLoad | null = own.pinLoad.newLinkLoad ?? borrowedLink;
    if (!newLinkCost) return excluded('no-link-cost');

    const ownMeasured = measured.get(planetId) ?? new Map<number, number[]>();
    const ratePerEcu = new Map<number, EcuRate>();
    for (const resource of local) {
      const here = mean(ownMeasured.get(resource.typeID) ?? []);
      ratePerEcu.set(
        resource.typeID,
        here !== null
          ? { unitsPerHour: here, source: 'measured' }
          : ownMean !== null
            ? { unitsPerHour: ownMean, source: 'own-mean' }
            : { unitsPerHour: prefs.fallbackRatePerHour, source: 'assumed' }
      );
    }

    const hasEcus = (own.pinLoad.counts.extractorControlUnit ?? 0) > 0;
    const headsPerExtractor = hasEcus
      ? meanHeadsPerExtractor(own)
      : (pilotHeads ?? DEFAULT_PLANNER_HEADS);

    // Per P0, how many ECUs run it today: the capacity model accepts that
    // layout as fitting, since the colony runs it (engine/pi/colonyCapacity.ts).
    const ecusByP0 = new Map<number, number>();
    for (const extractor of own.extractors) {
      if (extractor.productTypeId === null) continue;
      ecusByP0.set(extractor.productTypeId, (ecusByP0.get(extractor.productTypeId) ?? 0) + 1);
    }
    const p0TypeIds = [...ecusByP0.keys()].sort((a, b) => a - b);

    return {
      ...base,
      enabled: !prefs.disabled.has(planetId),
      excluded: null,
      headsAssumed: !hasEcus,
      linkCostBorrowed: own.pinLoad.newLinkLoad === null,
      colony: {
        planetId,
        planetType: planet.planet_type,
        budget: own.budget,
        newLinkCost,
        headsPerExtractor,
        taxRate,
        ratePerEcu,
        current: { p0TypeIds, productTypeIds: currentProductTypeIds(own, pi), ecusByP0 },
      },
    };
  });
}

/** The colonies the solver plans over: enabled and not excluded. */
export function goalPlannerInput(rows: readonly PlannerColonyRow[]): PlannerColony[] {
  return rows.flatMap((row) => (row.enabled && row.colony ? [row.colony] : []));
}

export function plannerPolicy(options: { maxP0Types: 1 | 2; buyP1: boolean }): PlannerPolicy {
  return {
    maxEcusPerColony: 2,
    maxP0TypesPerColony: options.maxP0Types,
    extraEcuFactor: DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR,
    buyTiers: options.buyP1 ? [1] : [],
  };
}

/**
 * The hub's books. A sale is valued at the bid, falling back to the ask for a
 * type with no buy order — the Advisor's `revenuePrices` rule, so a thin bid
 * book does not turn the whole plan into `needs-price`. Unknown Accounting
 * prices at level 0, the highest tax.
 */
export function priceBooks(
  prices: { prices: Readonly<Record<number, number>>; buyPrices: Readonly<Record<number, number>> },
  accountingLevel: number | null
): PriceBooks {
  return {
    ask: prices.prices,
    bid: { ...prices.prices, ...prices.buyPrices },
    salesTaxPct: salesTaxPct(accountingLevel ?? 0),
  };
}

function volumeOf(typeId: number, pi: PiData): number {
  return (
    pi.schematics[String(typeId)]?.volume ?? pi.raw.find((r) => r.typeID === typeId)?.volume ?? 0
  );
}

export interface PlanHauling {
  /** m3 per haul trip each colony ships out and takes in. */
  perColony: Map<number, { outM3: number; inM3: number }>;
  /** Every leg once per trip; a colony-to-colony leg counts once. */
  planM3PerTrip: number;
  /** What the Baseline would ship per trip: every colony's best P1. */
  baselineM3PerTrip: number;
}

/** The plan's hauling per trip at the pilot's haul cadence, against the Baseline's. */
export function planHauling(
  plan: Pick<GoalPlan, 'flows'>,
  baseline: BaselineTotal,
  pi: PiData,
  haulHours: number
): PlanHauling {
  const perColony = new Map<number, { outM3: number; inM3: number }>();
  const at = (id: number) => {
    let entry = perColony.get(id);
    if (!entry) {
      entry = { outM3: 0, inM3: 0 };
      perColony.set(id, entry);
    }
    return entry;
  };
  let planM3PerTrip = 0;
  for (const flow of plan.flows) {
    // The host feeding itself, or a goal bought and kept: nothing moves.
    if (flow.from === flow.to) continue;
    const m3 = flow.unitsPerHour * volumeOf(flow.typeId, pi) * haulHours;
    if (m3 <= 0) continue;
    planM3PerTrip += m3;
    if (flow.from !== 'hub') at(flow.from).outM3 += m3;
    if (flow.to !== 'hub') at(flow.to).inM3 += m3;
  }
  let baselineM3PerTrip = 0;
  for (const result of baseline.perColony.values()) {
    if (result.status !== 'ok') continue;
    for (const slot of result.slots) {
      baselineM3PerTrip += slot.p1PerHour * volumeOf(slot.p1TypeId, pi) * haulHours;
    }
  }
  return { perColony, planM3PerTrip, baselineM3PerTrip };
}

export interface PlanVerdict {
  lift: 'more' | 'less' | 'same';
  /**
   * Hauling effort (m3 x jumps) over the Baseline's, minus one: -0.6 is 60%
   * less. Null without a Baseline effort, or while any leg's distance is unknown.
   */
  haulChange: number | null;
  /** 'unknown' while any leg on either side has no distance yet: no claim either way. */
  distances: 'known' | 'unknown';
}

/** Below this an ISK/day Lift is rounding, not a difference worth a sentence. */
const SAME_LIFT_ISK_PER_DAY = 1;

export function planVerdict(
  liftPerDay: number,
  planEffort: HaulEffort,
  baselineEffort: HaulEffort
): PlanVerdict {
  const lift =
    Math.abs(liftPerDay) < SAME_LIFT_ISK_PER_DAY ? 'same' : liftPerDay > 0 ? 'more' : 'less';
  const distances =
    planEffort.unknownLegs > 0 || baselineEffort.unknownLegs > 0 ? 'unknown' : 'known';
  const haulChange =
    distances === 'known' && baselineEffort.m3JumpsPerHour > 0
      ? planEffort.m3JumpsPerHour / baselineEffort.m3JumpsPerHour - 1
      : null;
  return { lift, haulChange, distances };
}

/**
 * What the enabled colonies earn as they stand today — `builtColonyEarnings`
 * per colony at that colony's own customs rate, summed. A colony with no
 * measured extraction is counted in `coloniesWithoutFigure`, never as zero.
 */
export function earningsNow(
  rows: readonly PlannerColonyRow[],
  pi: PiData,
  prices: { prices: Readonly<Record<number, number>>; buyPrices: Readonly<Record<number, number>> },
  salesTaxPercent: number
): TotalColonyEarnings & { leftOut: number[]; byPlanet: Map<number, number | null> } {
  const revenuePrices = { ...prices.prices, ...prices.buyPrices };
  const leftOut: number[] = [];
  const byPlanet = new Map<number, number | null>();
  const perColony = rows.flatMap((row) => {
    // The same colonies the Baseline counts: enabled and costable.
    if (!row.enabled || !row.advice || !row.colony) return [];
    const earned = builtColonyEarnings(row.advice, pi, {
      prices: prices.prices,
      revenuePrices,
      taxRate: row.taxRate,
      salesTaxPct: salesTaxPercent,
    });
    if (earned.iskPerHour === null) leftOut.push(row.planetId);
    byPlanet.set(row.planetId, earned.iskPerHour);
    return [earned];
  });
  return {
    ...totalColonyEarnings(perColony),
    leftOut: leftOut.sort((a, b) => a - b),
    byPlanet,
  };
}
