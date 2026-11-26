import type { PiFactoryKind, PiPinKind } from '@/sde/types';
import type { PlanetType } from './goalTypes';
import { NET_TOLERANCE, NET_TOLERANCE_FLOOR } from './planBest';
import type { PinCounts, PinLoad, PiTier } from './types';

export const HOURS_PER_DAY = 24;

export type SellMarket = { kind: 'hub' } | { kind: 'buyback'; pct: number };

export interface SellBooks {
  prices: Readonly<Record<number, number>>;
  revenuePrices: Readonly<Record<number, number>>;
  salesTaxPct: number;
}

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

export type QuickWinDetail =
  | {
      kind: 'restart';
      reason: 'stopped' | 'decayed';
      extractors: number;
      resourceTypeIds: readonly number[];
    }
  | {
      kind: 'idle-factories';
      pinCount: number;
      freed: PinLoad;
      wouldFeed: number;
      headsToAdd: number | null;
      resourceTypeId: number | null;
    }
  | { kind: 'storage'; hoursToFull: number; haulHours: number }
  | { kind: 'spare-room'; what: 'extractors'; extraEcus: number; resourceTypeId: number }
  | {
      kind: 'spare-room';
      what: 'factories';
      productTypeId: number;
      factories: number;
      source: 'local' | 'network';
      routedFrom: readonly number[];
      needsRemoval: boolean;
    };

export interface QuickWin {
  id: string;
  planetId: number;
  detail: QuickWinDetail;
  gainPerDay: number | null;
  minutes: number;
  iskPerMinute: number | null;
}

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

export function isSaving(detail: QuickWinDetail): boolean {
  return detail.kind === 'storage';
}

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

export function roomClaim(detail: QuickWinDetail): RoomClaim | null {
  if (detail.kind === 'idle-factories') return detail.headsToAdd === null ? null : 'heads';
  if (detail.kind !== 'spare-room') return null;
  return detail.what === 'extractors' ? 'extractors' : `${detail.source}-factories`;
}

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

export type RebuildPreference = 'isk' | 'haul';

export interface RebuildCandidate {
  typeId: number;
  name: string;
  tier: PiTier;
  iskPerDay: number;
  m3PerDay: number;
  unitsPerDay: number;
  pins: PinCounts;
  recipe: {
    extracts: readonly number[];
    makes: readonly { typeId: number; facility: PiFactoryKind }[];
  };
  needsCcLevel: number | null;
  load?: PinLoad;
}

export interface RebuildFacts {
  planetId: number;
  planetType: PlanetType;
  colonyCcLevel: number;
  currentProductTypeIds: readonly number[];
  currentPins: PinCounts;
  todayM3PerDay: number | null;
  candidates: readonly RebuildCandidate[];
}

export type BuildStep =
  | { verb: 'upgrade'; fromLevel: number; toLevel: number; minutes: number }
  | { verb: 'remove' | 'place'; pin: PiPinKind; count: number; minutes: number }
  | { verb: 'set'; pin: PiPinKind; typeId: number; count: number; minutes: number }
  | { verb: 'route'; count: number; minutes: number };

export const STEP_MINUTES = {
  upgrade: 2,
  removePin: 0.25,
  placePin: 0.5,
  set: 0.5,
  routePin: 0.5,
} as const;

const PRODUCTION_PINS: readonly PiPinKind[] = [
  'extractorControlUnit',
  'basic',
  'advanced',
  'highTech',
];

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
  gainPerDay: number;
}

interface RebuildBase {
  planetId: number;
  planetType: PlanetType;
  todayPerDay: number;
  best: RebuildOption | null;
  alternative: RebuildOption | null;
}

export type RebuildPick =
  | (RebuildBase & {
      status: 'change';
      pick: RebuildOption;
      gainPerDay: number;
      steps: BuildStep[];
      minutes: number;
      upgradeFromLevel: number | null;
    })
  | (RebuildBase & {
      status: 'keep';
      reason: 'already-best' | 'gain-too-small' | 'no-candidates' | 'no-haul-saving';
    });

export const REBUILD_MIN_GAIN_SHARE = NET_TOLERANCE;
export const REBUILD_MIN_GAIN_PER_DAY = NET_TOLERANCE_FLOOR * HOURS_PER_DAY;
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
    const saves = best.m3PerDay < facts.todayM3PerDay * (1 - NET_TOLERANCE);
    if (!saves) return { ...base, status: 'keep', reason: 'no-haul-saving' };
  } else if (
    gainPerDay <= Math.max(REBUILD_MIN_GAIN_SHARE * todayPerDay, REBUILD_MIN_GAIN_PER_DAY)
  ) {
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

export type RebuildAdvice = RebuildPick | { status: 'refused'; planetId: number; reason: string };

export interface ColonyAdvice {
  planetId: number;
  planetType: PlanetType;
  todayPerDay: number | null;
  unknownReason: string | null;
  quickWins: QuickWin[];
  quickWinGainPerDay: number;
  afterQuickWinsPerDay: number | null;
  rebuild: RebuildAdvice;
  afterRebuildPerDay: number | null;
}

export function colonyAdvice(input: {
  planetId: number;
  planetType: PlanetType;
  todayPerDay: number | null;
  unknownReason?: string;
  quickWins: readonly QuickWin[];
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
  todayPerDay: number | null;
  afterQuickWinsPerDay: number | null;
  afterRebuildPerDay: number | null;
  quickWinMinutes: number;
  rebuildMinutes: number;
  unknownColonies: number;
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

export interface SlotNudge {
  used: number;
  allowed: number;
  free: number;
  assumed: boolean;
  canTrainMore: boolean;
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
