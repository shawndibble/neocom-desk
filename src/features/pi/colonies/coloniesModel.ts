/**
 * The Colonies tab's model: what is stopped, running out or full, what to do
 * about it, and when to log in next.
 *
 * ## No second set of figures
 *
 * Every ISK figure here is read off a `PlanAdvice` (`planAdviceModel.ts`), the
 * same object Plan reads: a row's fixes and the primary action's gain are that
 * advice's own `QuickWin`s, never re-priced. A colony with no advice (another
 * Character's, read cache-only, with no prices behind it) gets the same status
 * and the same meters, and its money figures are null.
 *
 * ## Status needs no ISK
 *
 * `checkStatus` reads only what ESI keeps current and what the storage and
 * factory checks already say, so an alt's row ranks the same way the active
 * Character's does.
 *
 * - **Stopped**: an extractor program has expired.
 * - **Expiring soon**: one expires inside the pilot's window.
 * - **Needs a look**: storage fills before the pilot's haul, a factory has no
 *   input, or every program is past its efficient window. None of these is
 *   broken today, all of them cost output.
 * - **Unknown**: no detail, or an extractor pin dropped for missing data.
 *   Saying "healthy" there would claim a check that never ran.
 *
 * One clock: everything takes `nowMs` from the caller (the advice snapshot's),
 * so a status chip and a quick win can never disagree about whether a program
 * has expired.
 */
import type { CharacterPlanet, CharacterPlanetDetail, PlanetPin } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { colonyAttention, colonyStatus } from '@/engine/pi/colonyStatus';
import { fractionOfFirstDayRate, hasYieldBaseline } from '@/engine/pi/extraction';
import { volumeOf } from '@/engine/pi/haulEffort';
import { quickWinMinutes, type QuickWin } from '@/engine/pi/planAdvice';
import type { ColonyStatus } from '@/engine/pi/types';
import {
  extractorExpiryMs,
  extractorInstallMs,
  extractorProgramsFromPins,
  hasUnverifiedExtractors,
  pinRole,
} from '../adapters';
import { builtAdvice } from '../advisorModel';
import { colonyPlan } from '../colonyPlan';
import { colonyStorage } from '../colonyThroughput';
import { fillsBeforeHaul } from '../colonyStripModel';

export const HOUR_MS = 3_600_000;
/** "Today": the window "expiring today" and one login's worth of work both cover. */
export const DAY_HOURS = 24;
/** A colony list older than this reads as stale on its own row. */
export const STALE_AFTER_HOURS = 24;

export type CheckStatus = 'stopped' | 'expiring' | 'needs-look' | 'unknown' | 'healthy';

/** Worst first. Unknown sits above healthy: not knowing is not the same as fine. */
export const STATUS_RANK: Record<CheckStatus, number> = {
  stopped: 0,
  expiring: 1,
  'needs-look': 2,
  unknown: 3,
  healthy: 4,
};

export interface StatusFacts {
  /** False for a colony with no cached detail, or an extractor pin that had to be dropped. */
  verified: boolean;
  status: ColonyStatus;
  nowMs: number;
  windowMs: number;
  /** Hours until storage fills at the extractors' peak; null when unreadable. */
  hoursToFull: number | null;
  haulHours: number;
  idleFactories: number;
}

export function checkStatus(facts: StatusFacts): CheckStatus {
  if (!facts.verified) return 'unknown';
  const attention = colonyAttention(facts.status, facts.nowMs, facts.windowMs);
  if (attention === 'idle') return 'stopped';
  if (attention === 'expiring-soon') return 'expiring';
  if (
    attention === 'decayed' ||
    fillsBeforeHaul(facts.hoursToFull, facts.haulHours) ||
    facts.idleFactories > 0
  ) {
    return 'needs-look';
  }
  return 'healthy';
}

// --- Fault tags and the primary action ------------------------------------------

export type FaultTag =
  | { kind: 'slowed'; fraction: number }
  | { kind: 'storage'; hoursToFull: number; urgent: boolean }
  | { kind: 'idle-factories'; count: number }
  | { kind: 'room-extractors'; count: number; gainPerDay: number | null }
  | { kind: 'room-factories'; count: number; gainPerDay: number | null }
  | { kind: 'stale'; hours: number };

export type PrimaryAction =
  | { kind: 'restart'; stopped: boolean; gainPerDay: number | null; minutes: number | null }
  | { kind: 'restart-by'; byMs: number; keepsPerDay: number | null }
  | { kind: 'haul'; savesPerDay: number | null; minutes: number }
  | { kind: 'fix-factories'; count: number; gainPerDay: number | null; minutes: number }
  | { kind: 'add-extractors'; count: number; gainPerDay: number | null; minutes: number }
  | { kind: 'add-factories'; count: number; gainPerDay: number | null; minutes: number }
  | { kind: 'details'; perDay: number | null };

/**
 * The one thing to do here. A stopped or slowed extractor outranks everything
 * (it is the biggest loss and the quickest fix); an expiring program with
 * nothing yet to restart still gets "restart by"; then the storage, idle
 * factory and spare-room wins in the order Plan ranks their kinds.
 */
export function primaryAction(args: {
  status: CheckStatus;
  quickWins: readonly QuickWin[];
  soonestExpiryMs: number | null;
  todayPerDay: number | null;
}): PrimaryAction {
  const { status, quickWins } = args;
  const find = <K extends QuickWin['detail']['kind']>(kind: K) =>
    quickWins.find((win) => win.detail.kind === kind);
  const restartWins = quickWins.filter((win) => win.detail.kind === 'restart');
  const stoppedWin = restartWins.find(
    (win) => win.detail.kind === 'restart' && win.detail.reason === 'stopped'
  );
  const decayedWin = restartWins.find(
    (win) => win.detail.kind === 'restart' && win.detail.reason === 'decayed'
  );

  if (status === 'stopped') {
    const win = stoppedWin ?? decayedWin;
    return {
      kind: 'restart',
      stopped: true,
      gainPerDay: stoppedWin
        ? restartWins.reduce<number | null>(
            (sum, w) => (w.gainPerDay === null || sum === null ? null : sum + w.gainPerDay),
            0
          )
        : null,
      minutes: win?.minutes ?? null,
    };
  }
  if (decayedWin) {
    return {
      kind: 'restart',
      stopped: false,
      gainPerDay: decayedWin.gainPerDay,
      minutes: decayedWin.minutes,
    };
  }
  if (status === 'expiring' && args.soonestExpiryMs !== null) {
    return { kind: 'restart-by', byMs: args.soonestExpiryMs, keepsPerDay: args.todayPerDay };
  }
  const storage = find('storage');
  if (storage) {
    return { kind: 'haul', savesPerDay: storage.gainPerDay, minutes: storage.minutes };
  }
  const idle = find('idle-factories');
  if (idle && idle.detail.kind === 'idle-factories') {
    return {
      kind: 'fix-factories',
      count: idle.detail.pinCount,
      gainPerDay: idle.gainPerDay,
      minutes: idle.minutes,
    };
  }
  for (const win of quickWins) {
    if (win.detail.kind !== 'spare-room') continue;
    return win.detail.what === 'extractors'
      ? {
          kind: 'add-extractors',
          count: win.detail.extraEcus,
          gainPerDay: win.gainPerDay,
          minutes: win.minutes,
        }
      : {
          kind: 'add-factories',
          count: win.detail.factories,
          gainPerDay: win.gainPerDay,
          minutes: win.minutes,
        };
  }
  return { kind: 'details', perDay: status === 'unknown' ? null : args.todayPerDay };
}

// --- One row ----------------------------------------------------------------------

export interface ExtractorFacts {
  /** The soonest-expiring extractor; null when the colony has none with a readable expiry. */
  expiryMs: number | null;
  /** Share of that program still to run (1 = just installed); null without an install time. */
  remainingFraction: number | null;
  /** Extractors expired, or expiring within a day of the soonest one: the restart's size. */
  due: number;
  total: number;
}

export interface StorageFacts {
  hoursToFull: number | null;
  haulHours: number;
  fillsBeforeHaul: boolean;
  /** Hours extraction would stall before the haul; 0 when it does not. */
  stallHours: number;
  /** m3 the launchpad and storage hold; null when unmeasured. */
  capacityM3: number | null;
  /** m3 stored as of the colony last being opened in game. */
  usedM3: number | null;
}

export interface LoadFacts {
  /** Used over budget, 0..1+; null when the colony's draw cannot be read. */
  cpu: number | null;
  power: number | null;
  ccLevel: number;
  /** The figures behind the fractions: tf and MW drawn, and this colony's own Command Center supply. */
  cpuUsed: number | null;
  cpuBudget: number | null;
  powerUsed: number | null;
  powerBudget: number | null;
}

export interface ColonyCheckRow {
  /** `${characterId}:${planetId}`. */
  key: string;
  characterId: number;
  planetId: number;
  systemId: number;
  planetType: CharacterPlanet['planet_type'];
  status: CheckStatus;
  extractor: ExtractorFacts;
  /** Past `EFFICIENT_WINDOW_FRACTION` of its first day's rate, the worst program's; else null. */
  slowedToFraction: number | null;
  storage: StorageFacts;
  load: LoadFacts;
  idleFactories: number;
  tags: FaultTag[];
  action: PrimaryAction;
  /** The colony's own quick wins, as Plan lists them; empty for a colony with no advice. */
  quickWins: readonly QuickWin[];
  todayPerDay: number | null;
  /** Hours since this colony's list was read; null for the live, active Character. */
  dataAgeHours: number | null;
}

/** The slice of `PlanColonyAdvice` a row reads. */
export interface RowAdvice {
  quickWins: readonly QuickWin[];
  todayPerDay: number | null;
}

export interface RowInput {
  characterId: number;
  planet: CharacterPlanet;
  detail: CharacterPlanetDetail | null;
  pi: PiData | null;
  radiusKm: number | null;
  nowMs: number;
  windowMs: number;
  haulHours: number;
  advice: RowAdvice | null;
  /** Hours since an alt's cached list was fetched; null for the live Character. */
  dataAgeHours?: number | null;
}

function extractorFacts(
  pins: readonly PlanetPin[],
  nowMs: number
): { facts: ExtractorFacts; soonest: PlanetPin | null } {
  const extractors = pins
    .filter((pin) => pinRole(pin) === 'extractor')
    .map((pin) => ({ pin, expiryMs: extractorExpiryMs(pin) }))
    .filter((entry): entry is { pin: PlanetPin; expiryMs: number } => entry.expiryMs !== null);
  if (extractors.length === 0) {
    return {
      facts: {
        expiryMs: null,
        remainingFraction: null,
        due: 0,
        total: pins.filter((pin) => pinRole(pin) === 'extractor').length,
      },
      soonest: null,
    };
  }
  const soonest = extractors.reduce((best, entry) =>
    entry.expiryMs < best.expiryMs ? entry : best
  );
  const installMs = extractorInstallMs(soonest.pin);
  const span = installMs === null ? 0 : soonest.expiryMs - installMs;
  return {
    facts: {
      expiryMs: soonest.expiryMs,
      remainingFraction:
        span > 0 ? Math.min(1, Math.max(0, (soonest.expiryMs - nowMs) / span)) : null,
      due: extractors.filter((entry) => entry.expiryMs <= soonest.expiryMs + DAY_HOURS * HOUR_MS)
        .length,
      total: extractors.length,
    },
    soonest: soonest.pin,
  };
}

function usedVolume(pins: readonly PlanetPin[], pi: PiData): number | null {
  let total = 0;
  let any = false;
  for (const pin of pins) {
    for (const item of pin.contents ?? []) {
      try {
        total += item.amount * volumeOf(item.type_id, pi);
        any = true;
      } catch {
        // An unpriced volume leaves the figure out rather than undercounting it.
        return null;
      }
    }
  }
  return any ? total : 0;
}

const fraction = (used: number, budget: number): number | null =>
  budget > 0 ? used / budget : null;

export function colonyCheckRow(input: RowInput): ColonyCheckRow {
  const { planet, detail, pi, nowMs, windowMs, haulHours } = input;
  const pins = detail?.pins ?? [];
  const status = colonyStatus(extractorProgramsFromPins(pins), nowMs);
  const verified = detail !== null && !hasUnverifiedExtractors(pins);

  const built = detail && pi ? builtAdvice(planet, detail, pi, input.radiusKm, nowMs) : null;
  const storage = built && pi ? colonyStorage(built, pins, pi, haulHours) : null;
  const idle = built && pi ? colonyPlan(built, pi).idle : null;
  const idleFactories = idle
    ? idle.lines.reduce((sum, entry) => sum + entry.line.surplusPins, 0)
    : 0;
  const hoursToFull = storage?.hoursToFull ?? null;

  const { facts: extractor } = extractorFacts(pins, nowMs);
  const slowed = status.decayed
    ? Math.min(
        ...extractorProgramsFromPins(pins)
          .filter(hasYieldBaseline)
          .map((program) => fractionOfFirstDayRate(program, nowMs))
      )
    : null;

  const rowStatus = checkStatus({
    verified,
    status,
    nowMs,
    windowMs,
    hoursToFull,
    haulHours,
    idleFactories,
  });
  const quickWins = input.advice?.quickWins ?? [];
  const todayPerDay = input.advice?.todayPerDay ?? null;

  const tags: FaultTag[] = [];
  if (slowed !== null && Number.isFinite(slowed) && rowStatus !== 'stopped') {
    tags.push({ kind: 'slowed', fraction: slowed });
  }
  if (hoursToFull !== null && fillsBeforeHaul(hoursToFull, haulHours)) {
    tags.push({ kind: 'storage', hoursToFull, urgent: hoursToFull < DAY_HOURS });
  }
  if (idleFactories > 0) tags.push({ kind: 'idle-factories', count: idleFactories });
  for (const win of quickWins) {
    if (win.detail.kind !== 'spare-room') continue;
    tags.push(
      win.detail.what === 'extractors'
        ? { kind: 'room-extractors', count: win.detail.extraEcus, gainPerDay: win.gainPerDay }
        : { kind: 'room-factories', count: win.detail.factories, gainPerDay: win.gainPerDay }
    );
  }
  const dataAgeHours = input.dataAgeHours ?? null;
  if (dataAgeHours !== null && dataAgeHours >= STALE_AFTER_HOURS) {
    tags.push({ kind: 'stale', hours: dataAgeHours });
  }

  return {
    key: `${input.characterId}:${planet.planet_id}`,
    characterId: input.characterId,
    planetId: planet.planet_id,
    systemId: planet.solar_system_id,
    planetType: planet.planet_type,
    status: rowStatus,
    extractor,
    slowedToFraction: slowed !== null && Number.isFinite(slowed) ? slowed : null,
    storage: {
      hoursToFull,
      haulHours,
      fillsBeforeHaul: fillsBeforeHaul(hoursToFull, haulHours),
      stallHours:
        hoursToFull !== null && fillsBeforeHaul(hoursToFull, haulHours)
          ? haulHours - Math.max(0, hoursToFull)
          : 0,
      capacityM3: storage?.bufferM3 ?? null,
      usedM3: pi ? usedVolume(pins, pi) : null,
    },
    load: {
      cpu: built ? fraction(built.pinLoad.load.cpu, built.budget.cpu) : null,
      power: built ? fraction(built.pinLoad.load.powergrid, built.budget.powergrid) : null,
      ccLevel: planet.upgrade_level,
      cpuUsed: built?.pinLoad.load.cpu ?? null,
      cpuBudget: built?.budget.cpu ?? null,
      powerUsed: built?.pinLoad.load.powergrid ?? null,
      powerBudget: built?.budget.powergrid ?? null,
    },
    idleFactories,
    tags,
    action: primaryAction({
      status: rowStatus,
      quickWins,
      soonestExpiryMs: extractor.expiryMs,
      todayPerDay,
    }),
    quickWins,
    todayPerDay,
    dataAgeHours,
  };
}

/**
 * Worst first: status rank, then the sooner deadline, then the shorter fill
 * time, then the planet id so a refresh never reshuffles equal rows.
 */
export function compareRows(a: ColonyCheckRow, b: ColonyCheckRow): number {
  return (
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    (a.extractor.expiryMs ?? Infinity) - (b.extractor.expiryMs ?? Infinity) ||
    (a.storage.hoursToFull ?? Infinity) - (b.storage.hoursToFull ?? Infinity) ||
    a.planetId - b.planetId
  );
}

export function sortRows(rows: readonly ColonyCheckRow[]): ColonyCheckRow[] {
  return [...rows].sort(compareRows);
}

// --- Today ------------------------------------------------------------------------

export interface DueItem {
  key: string;
  characterId: number;
  planetId: number;
  kind: 'restart' | 'haul';
  /** When it falls due; at or before `nowMs` means now. */
  atMs: number;
  /** In-game minutes, the same estimate Plan's quick wins use. */
  minutes: number;
  /** For a restart: it has already stopped. */
  stopped: boolean;
}

export interface TodayCounts {
  stopped: number;
  /** Not yet stopped, expiring within a day. */
  expiringToday: number;
  fullBeforeHaul: number;
  needsLook: number;
  healthy: number;
  unknown: number;
}

export interface TodayCheck {
  counts: TodayCounts;
  /** Everything with a deadline, soonest first. */
  due: DueItem[];
  /** The first one: the next thing to do. */
  next: DueItem | null;
  /** The first deadline, i.e. when to log in next; null when nothing has one. */
  loginAtMs: number | null;
  /** What one login covers: everything due within a day of `loginAtMs`. */
  trip: DueItem[];
  tripMinutes: number;
  /** Characters the trip needs a login on, in the order it visits them. */
  tripCharacterIds: number[];
}

export function todayCheck(rows: readonly ColonyCheckRow[], nowMs: number): TodayCheck {
  const counts: TodayCounts = {
    stopped: 0,
    expiringToday: 0,
    fullBeforeHaul: 0,
    needsLook: 0,
    healthy: 0,
    unknown: 0,
  };
  const due: DueItem[] = [];
  for (const row of rows) {
    if (row.status === 'stopped') counts.stopped += 1;
    else if (row.status === 'needs-look') counts.needsLook += 1;
    else if (row.status === 'healthy') counts.healthy += 1;
    else if (row.status === 'unknown') counts.unknown += 1;
    if (
      row.status !== 'stopped' &&
      row.extractor.expiryMs !== null &&
      row.extractor.expiryMs - nowMs <= DAY_HOURS * HOUR_MS
    ) {
      counts.expiringToday += 1;
    }
    if (row.storage.fillsBeforeHaul) counts.fullBeforeHaul += 1;
    if (row.status === 'unknown') continue;

    const { expiryMs } = row.extractor;
    if (expiryMs !== null) {
      due.push({
        key: row.key,
        characterId: row.characterId,
        planetId: row.planetId,
        kind: 'restart',
        atMs: expiryMs,
        minutes: quickWinMinutes({
          kind: 'restart',
          reason: 'stopped',
          extractors: Math.max(1, row.extractor.due),
          resourceTypeIds: [],
        }),
        stopped: expiryMs <= nowMs,
      });
    }
    if (row.storage.fillsBeforeHaul && row.storage.hoursToFull !== null) {
      due.push({
        key: row.key,
        characterId: row.characterId,
        planetId: row.planetId,
        kind: 'haul',
        atMs: nowMs + Math.max(0, row.storage.hoursToFull) * HOUR_MS,
        minutes: quickWinMinutes({ kind: 'storage', hoursToFull: 0, haulHours: 0 }),
        stopped: false,
      });
    }
  }
  due.sort(
    (a, b) =>
      a.atMs - b.atMs ||
      (a.kind === b.kind ? 0 : a.kind === 'restart' ? -1 : 1) ||
      a.planetId - b.planetId
  );

  const next = due[0] ?? null;
  const loginAtMs = next ? next.atMs : null;
  const trip = next ? due.filter((item) => item.atMs <= next.atMs + DAY_HOURS * HOUR_MS) : [];
  const tripCharacterIds: number[] = [];
  for (const item of trip) {
    if (!tripCharacterIds.includes(item.characterId)) tripCharacterIds.push(item.characterId);
  }
  return {
    counts,
    due,
    next,
    loginAtMs,
    trip,
    tripMinutes: trip.reduce((sum, item) => sum + item.minutes, 0),
    tripCharacterIds,
  };
}
