import type { CharacterPlanet, CharacterPlanetDetail, PlanetPin } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { colonyAttention } from '@/engine/pi/colonyStatus';
import { fractionOfFirstDayRate, hasYieldBaseline } from '@/engine/pi/extraction';
import { volumeOf } from '@/engine/pi/haulEffort';
import { quickWinMinutes, type QuickWin } from '@/engine/pi/planAdvice';
import type { ColonyStatus } from '@/engine/pi/types';
import {
  extractorExpiryMs,
  extractorInstallMs,
  colonyStatusFromPins,
  extractorProgramsFromPins,
  hasUnverifiedExtractors,
  pinRole,
} from '@/engine/pi/colonyPins';
import { builtAdvice } from '../systemPlanetModel';
import { colonyPlan } from '../colonyPlan';
import { colonyStorage } from '../colonyThroughput';
import { fillsBeforeHaul } from '../colonyFillModel';
import { HOUR_MS } from '@/lib/age';

export const DAY_HOURS = 24;
export const STALE_AFTER_HOURS = 24;

export type CheckStatus = 'stopped' | 'expiring' | 'needs-look' | 'unknown' | 'healthy';

export const STATUS_RANK: Record<CheckStatus, number> = {
  stopped: 0,
  expiring: 1,
  'needs-look': 2,
  unknown: 3,
  healthy: 4,
};

export interface StatusFacts {
  verified: boolean;
  status: ColonyStatus;
  nowMs: number;
  windowMs: number;
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

export type FaultTag =
  | { kind: 'slowed'; fraction: number }
  | { kind: 'storage'; hoursToFull: number; urgent: boolean }
  | { kind: 'idle-factories'; count: number }
  | { kind: 'room-extractors'; count: number; gainPerDay: number | null }
  | { kind: 'room-factories'; productTypeId: number; count: number; gainPerDay: number | null }
  | { kind: 'stale'; hours: number };

export function faultTagKey(tag: FaultTag): string {
  return tag.kind === 'room-factories' ? `${tag.kind}:${tag.productTypeId}` : tag.kind;
}

export type PrimaryAction =
  | { kind: 'restart'; stopped: boolean; gainPerDay: number | null; minutes: number | null }
  | { kind: 'restart-by'; byMs: number; keepsPerDay: number | null }
  | { kind: 'haul'; savesPerDay: number | null; minutes: number }
  | { kind: 'fix-factories'; count: number; gainPerDay: number | null; minutes: number }
  | { kind: 'add-extractors'; count: number; gainPerDay: number | null; minutes: number }
  | { kind: 'add-factories'; count: number; gainPerDay: number | null; minutes: number }
  | { kind: 'details'; perDay: number | null };

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

export interface ExtractorFacts {
  expiryMs: number | null;
  remainingFraction: number | null;
  due: number;
  total: number;
}

export interface StorageFacts {
  hoursToFull: number | null;
  haulHours: number;
  fillsBeforeHaul: boolean;
  stallHours: number;
  capacityM3: number | null;
  usedM3: number | null;
}

export interface LoadFacts {
  cpu: number | null;
  power: number | null;
  ccLevel: number;
  cpuUsed: number | null;
  cpuBudget: number | null;
  powerUsed: number | null;
  powerBudget: number | null;
  linkLoadUnknown: boolean;
}

export interface ColonyCheckRow {
  key: string;
  characterId: number;
  planetId: number;
  systemId: number;
  planetType: CharacterPlanet['planet_type'];
  status: CheckStatus;
  extractor: ExtractorFacts;
  slowedToFraction: number | null;
  storage: StorageFacts;
  load: LoadFacts;
  idleFactories: number;
  tags: FaultTag[];
  action: PrimaryAction;
  quickWins: readonly QuickWin[];
  todayPerDay: number | null;
  dataAgeHours: number | null;
}

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
  const status = colonyStatusFromPins(pins, nowMs);
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
        : {
            kind: 'room-factories',
            productTypeId: win.detail.productTypeId,
            count: win.detail.factories,
            gainPerDay: win.gainPerDay,
          }
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
      linkLoadUnknown:
        built !== null && built.pinLoad.linkCount > 0 && built.pinLoad.linkLoad === null,
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

export function matchesStatusFilter(
  status: CheckStatus,
  statuses: ReadonlySet<CheckStatus>
): boolean {
  return statuses.size === 0 || statuses.has(status);
}

export interface DueItem {
  key: string;
  characterId: number;
  planetId: number;
  kind: 'restart' | 'haul';
  atMs: number;
  minutes: number;
  stopped: boolean;
}

export interface TodayCounts {
  stopped: number;
  expiringToday: number;
  fullBeforeHaul: number;
  needsLook: number;
  healthy: number;
  unknown: number;
}

export interface TodayCheck {
  counts: TodayCounts;
  due: DueItem[];
  next: DueItem | null;
  loginAtMs: number | null;
  trip: DueItem[];
  tripMinutes: number;
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
  const tripEnd = next ? Math.max(next.atMs, nowMs) + DAY_HOURS * HOUR_MS : 0;
  const trip = next ? due.filter((item) => item.atMs <= tripEnd) : [];
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

export { HOUR_MS } from '@/lib/age';
