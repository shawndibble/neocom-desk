/**
 * The recommendation model behind the Plan tab: what each colony earns today,
 * its **Quick wins**, the one-planet **rebuild** worth making, and the totals
 * Plan, Map and Colonies all quote.
 *
 * ## One number, everywhere
 *
 * Every ISK figure here is **ISK a day, after customs, at the market the pilot
 * sells to**: a trade hub, or a corp buyback at a share of a hub (`sellBooks`).
 * No gross margins, no per-hour or per-unit figures. The conversion from the
 * engine's per-hour figures happens once, at the feature adapter, with
 * `HOURS_PER_DAY`.
 *
 * ## Quick wins add to today; a rebuild is quoted on top of them
 *
 * A **Quick win** is in-place tuning of a colony as it stands (ADR 0012's
 * tuning side). Quick wins add up, except a storage win's saving (`isSaving`),
 * and a colony's room is spent by one of them (`spendRoomOnce`). A rebuild changes what the colony makes, so
 * it is measured against *today after quick wins* (`pickRebuild`'s `todayPerDay`
 * argument), never against raw today: the pilot does the quick wins first, and
 * the rebuild's gain is what is left on top. That is the whole defence against
 * counting a quick win twice.
 *
 * ## Rebuilds are P1 and one-planet P2, never raw
 *
 * Extracted P0 is not sold in a recommendation (huge volume, thin market), and
 * P3 and above need several planets. A candidate outside P1 and P2 is ignored
 * here whatever its figure, so a caller cannot smuggle one in.
 *
 * ## Unknown is not zero
 *
 * A colony whose income cannot be measured has `todayPerDay: null`, and no
 * figure derived from it is a number. A quick win nobody can price has a `null`
 * gain and sorts after every priced one. Totals leave unknown colonies out and
 * count them (`unknownColonies`) so a partial sum is never presented as whole.
 *
 * Pure: facts and prices are parameters; the feature adapter
 * (`features/pi/planAdviceModel.ts`) builds them from ESI colonies.
 */

import type { PiFactoryKind, PiPinKind } from '@/sde/types';
import type { PlanetType } from './goalTypes';
import { NET_TOLERANCE, NET_TOLERANCE_FLOOR } from './planBest';
import type { PinCounts, PinLoad, PiTier } from './types';

/** The one place per-hour becomes per-day. */
export const HOURS_PER_DAY = 24;

// --- Sell market -------------------------------------------------------------

export type SellMarket = { kind: 'hub' } | { kind: 'buyback'; pct: number };

/** Prices as the engine's colony scorers take them. */
export interface SellBooks {
  /** What buying costs, by typeID: the hub's ask. */
  prices: Readonly<Record<number, number>>;
  /** What a sale earns, by typeID: the hub's highest buy, falling back to the ask. */
  revenuePrices: Readonly<Record<number, number>>;
  /** Percent, charged on every market sale. */
  salesTaxPct: number;
}

/**
 * The books a pilot sells into.
 *
 * A corp buyback pays a share of the hub's sale price and is not a market
 * order, so it carries **no sales tax**. Buying stays at the hub's ask: a
 * buyback only changes what a sale earns. Customs is unaffected either way, it
 * is paid at the colony's own office before anything is sold.
 */
export function sellBooks(hub: SellBooks, market: SellMarket): SellBooks {
  if (market.kind === 'hub') return hub;
  const { pct } = market;
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    throw new RangeError(`a corp buyback pays a share of the hub price in (0, 100], got ${pct}`);
  }
  return {
    prices: hub.prices,
    revenuePrices: Object.fromEntries(
      Object.entries(hub.revenuePrices).map(([typeId, price]) => [typeId, (price * pct) / 100])
    ),
    salesTaxPct: 0,
  };
}

// --- Quick wins --------------------------------------------------------------

export type QuickWinDetail =
  /** Restart extractor programs that have stopped, or decayed past the point a restart pays. */
  | {
      kind: 'restart';
      reason: 'stopped' | 'decayed';
      extractors: number;
      resourceTypeIds: readonly number[];
    }
  /** Facilities nothing feeds: remove them, and add the heads that would feed them when that fits. */
  | {
      kind: 'idle-factories';
      pinCount: number;
      freed: PinLoad;
      wouldFeed: number;
      /** Extractor heads to add in their place; null when the freed budget buys none. */
      headsToAdd: number | null;
      resourceTypeId: number | null;
    }
  /** Storage that fills before the pilot's next haul, so extraction stalls. */
  | { kind: 'storage'; hoursToFull: number; haulHours: number }
  /** CPU and Powergrid left over for more extractors or factories. */
  | { kind: 'spare-room'; what: 'extractors'; extraEcus: number; resourceTypeId: number }
  | {
      kind: 'spare-room';
      what: 'factories';
      productTypeId: number;
      factories: number;
      /** `local`: refining the colony's own raw. `network`: the network plan's factories. */
      source: 'local' | 'network';
      /** Colonies whose surplus the factories draw on, ascending; empty when the host feeds them itself. */
      routedFrom: readonly number[];
      /** The room is held by idle factories the pilot must take out first. */
      needsRemoval: boolean;
    };

export interface QuickWin {
  /** Stable across refreshes: planet, kind and what it acts on. */
  id: string;
  planetId: number;
  detail: QuickWinDetail;
  /** ISK a day it adds to today. Null is unknown, never zero. */
  gainPerDay: number | null;
  minutes: number;
  /** `gainPerDay / minutes`; null with the gain. */
  iskPerMinute: number | null;
}

/**
 * In-game minutes per quick win. Estimates, and badged as such by the page:
 * a base for finding the colony and opening it, plus a figure per pin touched.
 */
export const QUICK_WIN_MINUTES = {
  restart: { base: 1, each: 1 },
  idle: { base: 2, perPin: 0.5, heads: 1 },
  storage: { base: 3 },
  extractors: { base: 2, each: 2 },
  factories: { base: 2, each: 1 },
} as const;

export function quickWinMinutes(detail: QuickWinDetail): number {
  const t = QUICK_WIN_MINUTES;
  switch (detail.kind) {
    case 'restart':
      return Math.ceil(t.restart.base + t.restart.each * detail.extractors);
    case 'idle-factories':
      return Math.ceil(
        t.idle.base + t.idle.perPin * detail.pinCount + (detail.headsToAdd ? t.idle.heads : 0)
      );
    case 'storage':
      return t.storage.base;
    case 'spare-room':
      return detail.what === 'extractors'
        ? Math.ceil(t.extractors.base + t.extractors.each * detail.extraEcus)
        : Math.ceil(t.factories.base + t.factories.each * detail.factories);
  }
}

export function quickWinId(planetId: number, detail: QuickWinDetail): string {
  switch (detail.kind) {
    case 'restart':
      return `${planetId}:restart-${detail.reason}`;
    case 'idle-factories':
      return `${planetId}:idle`;
    case 'storage':
      return `${planetId}:storage`;
    case 'spare-room':
      return detail.what === 'extractors'
        ? `${planetId}:room-extractors`
        : `${planetId}:room-factories:${detail.productTypeId}`;
  }
}

export function quickWin(
  planetId: number,
  detail: QuickWinDetail,
  gainPerDay: number | null
): QuickWin {
  const minutes = quickWinMinutes(detail);
  return {
    id: quickWinId(planetId, detail),
    planetId,
    detail,
    gainPerDay,
    minutes,
    iskPerMinute: gainPerDay === null ? null : gainPerDay / minutes,
  };
}

/**
 * Best ISK per minute first. A win with no figure goes after every priced one
 * (never in the middle as a zero); ties break on the id so a refresh that
 * leaves two equal wins does not reshuffle the list under the pilot.
 */
export function orderQuickWins(wins: readonly QuickWin[]): QuickWin[] {
  return [...wins].sort((a, b) => {
    if ((a.iskPerMinute === null) !== (b.iskPerMinute === null)) {
      return a.iskPerMinute === null ? 1 : -1;
    }
    return (
      (b.iskPerMinute ?? 0) - (a.iskPerMinute ?? 0) ||
      (b.gainPerDay ?? 0) - (a.gainPerDay ?? 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  });
}

/**
 * A storage win saves income the colony loses to a full launchpad; it adds
 * nothing to what the colony makes. Its figure is shown as a saving and left
 * out of every quick-win total.
 */
export function isSaving(detail: QuickWinDetail): boolean {
  return detail.kind === 'storage';
}

/** A saving's minutes count; its figure does not. */
export function totalQuickWins(wins: readonly QuickWin[]): {
  gainPerDay: number;
  minutes: number;
  unpriced: number;
} {
  const adds = wins.filter((win) => !isSaving(win.detail));
  return {
    gainPerDay: adds.reduce((sum, win) => sum + (win.gainPerDay ?? 0), 0),
    minutes: wins.reduce((sum, win) => sum + win.minutes, 0),
    unpriced: adds.filter((win) => win.gainPerDay === null).length,
  };
}

export type RoomClaim = 'heads' | 'extractors' | 'local-factories' | 'network-factories';

/**
 * The colony CPU and Powergrid a win spends, or null. Each source's factories
 * are one claim: that source already split the room between them.
 */
export function roomClaim(detail: QuickWinDetail): RoomClaim | null {
  if (detail.kind === 'idle-factories') return detail.headsToAdd === null ? null : 'heads';
  if (detail.kind !== 'spare-room') return null;
  return detail.what === 'extractors' ? 'extractors' : `${detail.source}-factories`;
}

/**
 * One colony's room is spent once. Of the claims on it, the one that adds the
 * most ISK a day stays: a figure beats none, a tie keeps the first. Losing
 * heads fall back to removing the idle factories, unpriced, so those are still
 * named; other losing claims are dropped.
 */
export function spendRoomOnce(wins: readonly QuickWin[]): QuickWin[] {
  const byPlanet = new Map<number, Map<RoomClaim, { priced: boolean; gain: number }>>();
  for (const win of wins) {
    const claim = roomClaim(win.detail);
    if (claim === null) continue;
    const claims = byPlanet.get(win.planetId) ?? new Map();
    const sum = claims.get(claim) ?? { priced: false, gain: 0 };
    claims.set(claim, {
      priced: sum.priced || win.gainPerDay !== null,
      gain: sum.gain + (win.gainPerDay ?? 0),
    });
    byPlanet.set(win.planetId, claims);
  }
  const kept = new Map<number, RoomClaim>();
  for (const [planetId, claims] of byPlanet) {
    let best: [RoomClaim, { priced: boolean; gain: number }] | null = null;
    for (const entry of claims) {
      const [, value] = entry;
      if (
        best === null ||
        (value.priced && !best[1].priced) ||
        (value.priced === best[1].priced && value.gain > best[1].gain)
      ) {
        best = entry;
      }
    }
    if (best) kept.set(planetId, best[0]);
  }
  return wins.flatMap((win) => {
    const claim = roomClaim(win.detail);
    if (claim === null || kept.get(win.planetId) === claim) return [win];
    if (win.detail.kind === 'idle-factories') {
      return [quickWin(win.planetId, { ...win.detail, headsToAdd: null }, null)];
    }
    return [];
  });
}

// --- Rebuild -----------------------------------------------------------------

/** Most ISK, or the least hauling among recipes worth running. */
export type RebuildPreference = 'isk' | 'haul';

export interface RebuildCandidate {
  typeId: number;
  name: string;
  tier: PiTier;
  /** ISK a day the rebuilt colony earns, after customs and sales tax. */
  iskPerDay: number;
  /** m3 a day it ships. */
  m3PerDay: number;
  unitsPerDay: number;
  /** The pins the layout is built from, overhead included. */
  pins: PinCounts;
  /** What gets extracted, and what each factory kind is set to make. */
  recipe: {
    extracts: readonly number[];
    makes: readonly { typeId: number; facility: PiFactoryKind }[];
  };
  /** Command Center level the layout needs; null when it fits the colony's own. */
  needsCcLevel: number | null;
  /** CPU and Powergrid the layout draws, extractor heads included. Absent when not costed. */
  load?: PinLoad;
}

export interface RebuildFacts {
  planetId: number;
  planetType: PlanetType;
  colonyCcLevel: number;
  /** Products the colony's factories make today. */
  currentProductTypeIds: readonly number[];
  currentPins: PinCounts;
  /** m3 a day the colony ships today; null when it cannot be measured. */
  todayM3PerDay: number | null;
  candidates: readonly RebuildCandidate[];
}

export type BuildStep =
  | { verb: 'upgrade'; fromLevel: number; toLevel: number; minutes: number }
  | { verb: 'remove' | 'place'; pin: PiPinKind; count: number; minutes: number }
  /** `count` pins of that kind set to `typeId`: the kind's pins split across its sets, at least one each. */
  | { verb: 'set'; pin: PiPinKind; typeId: number; count: number; minutes: number }
  | { verb: 'route'; count: number; minutes: number };

/** In-game minutes per step. Estimates. */
export const STEP_MINUTES = {
  upgrade: 2,
  removePin: 0.25,
  placePin: 0.5,
  set: 0.5,
  routePin: 0.5,
} as const;

/** The pins a rebuild takes out and puts back; the Command Center, storage and launchpad stay. */
const PRODUCTION_PINS: readonly PiPinKind[] = [
  'extractorControlUnit',
  'basic',
  'advanced',
  'highTech',
];

/**
 * The in-game checklist for a rebuild, in the order a pilot does it: upgrade,
 * remove, place, set, route. Pins the colony already has are kept, not removed
 * and placed again. Routes are one per production pin the layout runs, an
 * estimate: ESI does not say which pin feeds which.
 */
export function buildSteps(
  candidate: RebuildCandidate,
  from: { currentPins: PinCounts; fromLevel: number }
): { steps: BuildStep[]; minutes: number } {
  const steps: BuildStep[] = [];
  if (candidate.needsCcLevel !== null && candidate.needsCcLevel > from.fromLevel) {
    steps.push({
      verb: 'upgrade',
      fromLevel: from.fromLevel,
      toLevel: candidate.needsCcLevel,
      minutes: STEP_MINUTES.upgrade,
    });
  }

  const have = (kind: PiPinKind) => from.currentPins[kind] ?? 0;
  const want = (kind: PiPinKind) => candidate.pins[kind] ?? 0;

  for (const kind of PRODUCTION_PINS) {
    const count = have(kind) - want(kind);
    if (count > 0)
      steps.push({ verb: 'remove', pin: kind, count, minutes: count * STEP_MINUTES.removePin });
  }
  const kinds = Object.keys(candidate.pins) as PiPinKind[];
  for (const kind of kinds) {
    const count = want(kind) - have(kind);
    if (count > 0)
      steps.push({ verb: 'place', pin: kind, count, minutes: count * STEP_MINUTES.placePin });
  }
  const sets: { pin: PiPinKind; typeId: number }[] = [
    ...candidate.recipe.extracts.map((typeId) => ({
      pin: 'extractorControlUnit' as const,
      typeId,
    })),
    ...candidate.recipe.makes.map((make) => ({ pin: make.facility, typeId: make.typeId })),
  ];
  for (const [index, set] of sets.entries()) {
    const count = setCount(set.pin, index, sets, want(set.pin));
    steps.push({ verb: 'set', ...set, count, minutes: count * STEP_MINUTES.set });
  }
  const routes = PRODUCTION_PINS.reduce((sum, kind) => sum + want(kind), 0);
  if (routes > 0) {
    steps.push({ verb: 'route', count: routes, minutes: routes * STEP_MINUTES.routePin });
  }

  return { steps, minutes: Math.ceil(steps.reduce((sum, step) => sum + step.minutes, 0)) };
}

/**
 * How many of `pins` pins of one kind the set at `index` covers. The layout
 * does not say which factory makes which input, so a kind's pins split evenly
 * across its sets, the remainder to the earliest; at least one each.
 */
function setCount(
  pin: PiPinKind,
  index: number,
  sets: readonly { pin: PiPinKind }[],
  pins: number
): number {
  const ofKind = sets.filter((set) => set.pin === pin).length;
  const position = sets.slice(0, index).filter((set) => set.pin === pin).length;
  const share = Math.floor(pins / ofKind) + (position < pins % ofKind ? 1 : 0);
  return Math.max(1, share);
}

export interface RebuildOption extends RebuildCandidate {
  /** Against today after quick wins; negative for a recipe that earns less but hauls less. */
  gainPerDay: number;
}

interface RebuildBase {
  planetId: number;
  planetType: PlanetType;
  /** Today after quick wins: what the rebuild is measured against. */
  todayPerDay: number;
  /** The model's pick under the pilot's preference, even when the colony keeps what it has. */
  best: RebuildOption | null;
  /** The pick under the other preference, or the runner-up when both agree. */
  alternative: RebuildOption | null;
}

export type RebuildPick =
  | (RebuildBase & {
      status: 'change';
      pick: RebuildOption;
      gainPerDay: number;
      steps: BuildStep[];
      minutes: number;
      /** The colony's own level when the recipe needs a higher one. */
      upgradeFromLevel: number | null;
    })
  | (RebuildBase & {
      status: 'keep';
      reason: 'already-best' | 'gain-too-small' | 'no-candidates' | 'no-haul-saving';
    });

/** The least a recipe must earn, as a share of today, to be worth rebuilding for. */
export const REBUILD_MIN_GAIN_SHARE = NET_TOLERANCE;
/** ISK a day: the same 100 ISK/h floor the host picker uses, so near-zero colonies do not flap. */
export const REBUILD_MIN_GAIN_PER_DAY = NET_TOLERANCE_FLOOR * HOURS_PER_DAY;
/**
 * Under "Least hauling", the share of the best recipe's ISK a lighter recipe
 * must still earn to be offered. Without a floor "least hauling" would pick a
 * recipe that earns almost nothing because it also moves almost nothing.
 */
export const LEAST_HAUL_MIN_SHARE = 0.5;

function byIsk(a: RebuildCandidate, b: RebuildCandidate): number {
  return b.iskPerDay - a.iskPerDay || a.tier - b.tier || a.typeId - b.typeId;
}

function rank(
  pool: readonly RebuildCandidate[],
  preference: RebuildPreference
): RebuildCandidate[] {
  const byValue = [...pool].sort(byIsk);
  if (preference === 'isk' || byValue.length === 0) return byValue;
  const floor = byValue[0].iskPerDay * LEAST_HAUL_MIN_SHARE;
  const worthRunning = byValue.filter((candidate) => candidate.iskPerDay >= floor);
  return worthRunning.sort((a, b) => a.m3PerDay - b.m3PerDay || byIsk(a, b));
}

/**
 * The best one-planet recipe for this colony, or "keep".
 *
 * @param todayPerDay today **after quick wins**, ISK a day.
 */
export function pickRebuild(
  facts: RebuildFacts,
  todayPerDay: number,
  preference: RebuildPreference
): RebuildPick {
  const pool = facts.candidates.filter(
    (candidate) =>
      (candidate.tier === 1 || candidate.tier === 2) &&
      Number.isFinite(candidate.iskPerDay) &&
      candidate.iskPerDay > 0
  );
  const optionOf = (candidate: RebuildCandidate | undefined): RebuildOption | null =>
    candidate ? { ...candidate, gainPerDay: candidate.iskPerDay - todayPerDay } : null;

  const ranked = rank(pool, preference);
  const other = rank(pool, preference === 'isk' ? 'haul' : 'isk');
  const best = ranked[0];
  const alternative =
    other[0] && other[0].typeId !== best?.typeId
      ? other[0]
      : ranked.find((candidate) => candidate.typeId !== best?.typeId);

  const base: RebuildBase = {
    planetId: facts.planetId,
    planetType: facts.planetType,
    todayPerDay,
    best: optionOf(best),
    alternative: optionOf(alternative),
  };
  if (!best) return { ...base, status: 'keep', reason: 'no-candidates' };

  if (facts.currentProductTypeIds.includes(best.typeId)) {
    return { ...base, status: 'keep', reason: 'already-best' };
  }

  const gainPerDay = best.iskPerDay - todayPerDay;
  if (preference === 'isk') {
    const worthIt =
      gainPerDay > Math.max(REBUILD_MIN_GAIN_SHARE * todayPerDay, REBUILD_MIN_GAIN_PER_DAY);
    if (!worthIt) return { ...base, status: 'keep', reason: 'gain-too-small' };
  } else if (facts.todayM3PerDay !== null) {
    // Least hauling is worth a rebuild only when it actually hauls less.
    const saves = best.m3PerDay < facts.todayM3PerDay * (1 - NET_TOLERANCE);
    if (!saves) return { ...base, status: 'keep', reason: 'no-haul-saving' };
  } else if (
    gainPerDay <= Math.max(REBUILD_MIN_GAIN_SHARE * todayPerDay, REBUILD_MIN_GAIN_PER_DAY)
  ) {
    // Today's hauling is unknown, so the haul saving cannot be judged: fall back to ISK.
    return { ...base, status: 'keep', reason: 'gain-too-small' };
  }

  const { steps, minutes } = buildSteps(best, {
    currentPins: facts.currentPins,
    fromLevel: facts.colonyCcLevel,
  });
  return {
    ...base,
    status: 'change',
    pick: optionOf(best)!,
    gainPerDay,
    steps,
    minutes,
    upgradeFromLevel:
      best.needsCcLevel !== null && best.needsCcLevel > facts.colonyCcLevel
        ? facts.colonyCcLevel
        : null,
  };
}

// --- One colony, and the plan ------------------------------------------------

export type RebuildAdvice = RebuildPick | { status: 'refused'; planetId: number; reason: string };

export interface ColonyAdvice {
  planetId: number;
  planetType: PlanetType;
  /** ISK a day as the colony runs now; null when it cannot be measured. */
  todayPerDay: number | null;
  /** Why `todayPerDay` is null. */
  unknownReason: string | null;
  quickWins: QuickWin[];
  /** Sum of the priced quick wins that add; savings excluded. */
  quickWinGainPerDay: number;
  afterQuickWinsPerDay: number | null;
  rebuild: RebuildAdvice;
  /** After quick wins and the rebuild's gain on top. */
  afterRebuildPerDay: number | null;
}

export function colonyAdvice(input: {
  planetId: number;
  planetType: PlanetType;
  todayPerDay: number | null;
  unknownReason?: string;
  quickWins: readonly QuickWin[];
  /** The facts to rebuild from, or the reason the colony cannot be rebuilt-scored. */
  rebuild: RebuildFacts | { refused: string };
  preference: RebuildPreference;
}): ColonyAdvice {
  const quickWins = orderQuickWins(input.quickWins);
  const { gainPerDay: quickWinGainPerDay } = totalQuickWins(quickWins);
  const afterQuickWinsPerDay =
    input.todayPerDay === null ? null : input.todayPerDay + quickWinGainPerDay;

  let rebuild: RebuildAdvice;
  if ('refused' in input.rebuild) {
    rebuild = { status: 'refused', planetId: input.planetId, reason: input.rebuild.refused };
  } else if (afterQuickWinsPerDay === null) {
    rebuild = { status: 'refused', planetId: input.planetId, reason: 'needs-today' };
  } else {
    rebuild = pickRebuild(input.rebuild, afterQuickWinsPerDay, input.preference);
  }

  const afterRebuildPerDay =
    afterQuickWinsPerDay === null
      ? null
      : rebuild.status === 'change'
        ? afterQuickWinsPerDay + rebuild.gainPerDay
        : afterQuickWinsPerDay;

  return {
    planetId: input.planetId,
    planetType: input.planetType,
    todayPerDay: input.todayPerDay,
    unknownReason: input.todayPerDay === null ? (input.unknownReason ?? 'unknown') : null,
    quickWins,
    quickWinGainPerDay,
    afterQuickWinsPerDay,
    rebuild,
    afterRebuildPerDay,
  };
}

export interface PlanTotals {
  /** Summed over colonies with a figure; null when none has one. */
  todayPerDay: number | null;
  afterQuickWinsPerDay: number | null;
  afterRebuildPerDay: number | null;
  quickWinMinutes: number;
  /** One-time in-game minutes for every colony whose recommendation is a change. */
  rebuildMinutes: number;
  /** Colonies left out of the sums for want of a figure. */
  unknownColonies: number;
  /** Quick wins that add but have no ISK figure. */
  unpricedQuickWins: number;
}

export function planTotals(colonies: readonly ColonyAdvice[]): PlanTotals {
  const known = colonies.filter((colony) => colony.todayPerDay !== null);
  const sum = (pick: (colony: ColonyAdvice) => number | null) =>
    known.length === 0 ? null : known.reduce((total, colony) => total + (pick(colony) ?? 0), 0);
  const wins = totalQuickWins(colonies.flatMap((colony) => colony.quickWins));
  return {
    todayPerDay: sum((colony) => colony.todayPerDay),
    afterQuickWinsPerDay: sum((colony) => colony.afterQuickWinsPerDay),
    afterRebuildPerDay: sum((colony) => colony.afterRebuildPerDay),
    quickWinMinutes: wins.minutes,
    rebuildMinutes: colonies.reduce(
      (total, colony) => total + (colony.rebuild.status === 'change' ? colony.rebuild.minutes : 0),
      0
    ),
    unknownColonies: colonies.length - known.length,
    unpricedQuickWins: wins.unpriced,
  };
}

// --- Interplanetary Consolidation nudge --------------------------------------

export interface SlotNudge {
  used: number;
  allowed: number;
  /** Planets the pilot could still add; zero at or over the cap. */
  free: number;
  /** The skill never loaded, so `allowed` is the untrained ceiling and may be wrong. */
  assumed: boolean;
  /** Training the skill would allow more planets. */
  canTrainMore: boolean;
  /** What one more planet would earn a day, at the best one-planet recipe. Null when unknown. */
  gainPerPlanetPerDay: number | null;
}

export function slotNudge(input: {
  used: number;
  allowed: number;
  maxSlots: number;
  assumed: boolean;
  bestOnePlanetGainPerDay: number | null;
}): SlotNudge {
  return {
    used: input.used,
    allowed: input.allowed,
    free: Math.max(0, input.allowed - input.used),
    assumed: input.assumed,
    canTrainMore: input.allowed < input.maxSlots,
    gainPerPlanetPerDay: input.bestOnePlanetGainPerDay,
  };
}
