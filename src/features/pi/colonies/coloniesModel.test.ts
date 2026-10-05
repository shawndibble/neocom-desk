import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { CharacterPlanet, CharacterPlanetDetail, PlanetPin } from '@/esi/endpoints';
import { piTier } from '@/engine/pi/chain';
import { quickWin, type QuickWin } from '@/engine/pi/planAdvice';
import type { ColonyStatus } from '@/engine/pi/types';
import type { PlannerSnapshot } from '../goalPlannerModel';
import { buildPlanAdvice, hubBooks } from '../planAdviceModel';
import {
  checkStatus,
  colonyCheckRow,
  compareRows,
  primaryAction,
  sortRows,
  todayCheck,
  HOUR_MS,
  type ColonyCheckRow,
  type StatusFacts,
} from './coloniesModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const NOW = Date.parse('2026-10-01T00:00:00Z');
const WINDOW = 24 * HOUR_MS;

const healthy: ColonyStatus = { idle: false, soonestExpiryMs: NOW + 70 * HOUR_MS };

function facts(overrides: Partial<StatusFacts> = {}): StatusFacts {
  return {
    verified: true,
    status: healthy,
    nowMs: NOW,
    windowMs: WINDOW,
    hoursToFull: 500,
    haulHours: 168,
    idleFactories: 0,
    ...overrides,
  };
}

describe('checkStatus', () => {
  it('is healthy when nothing is expiring, filling or idle', () => {
    expect(checkStatus(facts())).toBe('healthy');
  });

  it('is stopped once an extractor program has expired', () => {
    expect(checkStatus(facts({ status: { idle: true, soonestExpiryMs: NOW - HOUR_MS } }))).toBe(
      'stopped'
    );
  });

  it("is expiring soon inside the pilot's window, and healthy just outside it", () => {
    const inside = { idle: false, soonestExpiryMs: NOW + 6 * HOUR_MS };
    const outside = { idle: false, soonestExpiryMs: NOW + 25 * HOUR_MS };
    expect(checkStatus(facts({ status: inside }))).toBe('expiring');
    expect(checkStatus(facts({ status: outside }))).toBe('healthy');
    expect(checkStatus(facts({ status: outside, windowMs: 48 * HOUR_MS }))).toBe('expiring');
  });

  it('needs a look when storage fills before the haul', () => {
    expect(checkStatus(facts({ hoursToFull: 16 }))).toBe('needs-look');
  });

  it('is not a problem when storage fills exactly at, or after, the haul', () => {
    expect(checkStatus(facts({ hoursToFull: 168 }))).toBe('healthy');
    expect(checkStatus(facts({ hoursToFull: null }))).toBe('healthy');
  });

  it('needs a look when a factory has no input', () => {
    expect(checkStatus(facts({ idleFactories: 2 }))).toBe('needs-look');
  });

  it('needs a look when every program is past its efficient window (decayed, not yet expiring)', () => {
    const decayed = { idle: false, soonestExpiryMs: NOW + 70 * HOUR_MS, decayed: true };
    expect(checkStatus(facts({ status: decayed }))).toBe('needs-look');
  });

  it('puts stopped and expiring ahead of a storage or factory fault', () => {
    expect(
      checkStatus(facts({ status: { idle: true, soonestExpiryMs: NOW - HOUR_MS }, hoursToFull: 4 }))
    ).toBe('stopped');
    expect(
      checkStatus(
        facts({ status: { idle: false, soonestExpiryMs: NOW + HOUR_MS }, idleFactories: 3 })
      )
    ).toBe('expiring');
  });

  it('is unknown, never healthy, when the colony could not be fully read', () => {
    expect(checkStatus(facts({ verified: false }))).toBe('unknown');
  });
});

function win(detail: QuickWin['detail'], gain: number | null, planetId = 1): QuickWin {
  return quickWin(planetId, detail, gain);
}

const restart = (reason: 'stopped' | 'decayed', gain: number | null) =>
  win({ kind: 'restart', reason, extractors: 1, resourceTypeIds: [] }, gain);

describe('primaryAction', () => {
  const base = { soonestExpiryMs: NOW + 6 * HOUR_MS, todayPerDay: 500_000 };

  it("restarts a stopped colony at the quick win's own gain", () => {
    const action = primaryAction({
      ...base,
      status: 'stopped',
      quickWins: [restart('stopped', 387_000)],
    });
    expect(action).toMatchObject({ kind: 'restart', stopped: true, gainPerDay: 387_000 });
  });

  it('still says restart for a stopped colony with no priced win, with no figure', () => {
    expect(primaryAction({ ...base, status: 'stopped', quickWins: [] })).toMatchObject({
      kind: 'restart',
      stopped: true,
      gainPerDay: null,
    });
  });

  it('restarts an expiring colony whose program has slowed, with that win', () => {
    expect(
      primaryAction({ ...base, status: 'expiring', quickWins: [restart('decayed', 95_000)] })
    ).toMatchObject({ kind: 'restart', stopped: false, gainPerDay: 95_000 });
  });

  it('asks for a restart by the expiry when nothing has slowed yet, and says what it keeps', () => {
    expect(primaryAction({ ...base, status: 'expiring', quickWins: [] })).toEqual({
      kind: 'restart-by',
      byMs: base.soonestExpiryMs,
      keepsPerDay: 500_000,
    });
  });

  it('hauls when storage is the fault', () => {
    expect(
      primaryAction({
        ...base,
        status: 'needs-look',
        quickWins: [win({ kind: 'storage', hoursToFull: 16, haulHours: 168 }, 120_000)],
      })
    ).toMatchObject({ kind: 'haul', savesPerDay: 120_000 });
  });

  it('fixes idle factories and adds spare-room extractors', () => {
    const idle = win(
      {
        kind: 'idle-factories',
        pinCount: 2,
        freed: { cpu: 0, powergrid: 0 },
        wouldFeed: 2,
        headsToAdd: null,
        resourceTypeId: null,
      },
      40_000
    );
    const room = win(
      { kind: 'spare-room', what: 'extractors', extraEcus: 2, resourceTypeId: 1 },
      55_000
    );
    expect(primaryAction({ ...base, status: 'needs-look', quickWins: [idle, room] })).toMatchObject(
      {
        kind: 'fix-factories',
        count: 2,
        gainPerDay: 40_000,
      }
    );
    expect(primaryAction({ ...base, status: 'healthy', quickWins: [room] })).toMatchObject({
      kind: 'add-extractors',
      count: 2,
      gainPerDay: 55_000,
    });
  });

  it('is plain Details, with what the colony makes, for a healthy colony with nothing to do', () => {
    expect(primaryAction({ ...base, status: 'healthy', quickWins: [] })).toEqual({
      kind: 'details',
      perDay: 500_000,
    });
  });

  it('claims no figure for an unknown colony', () => {
    expect(primaryAction({ ...base, status: 'unknown', quickWins: [] })).toEqual({
      kind: 'details',
      perDay: null,
    });
  });
});

function row(overrides: Partial<ColonyCheckRow> = {}): ColonyCheckRow {
  return {
    key: '1:1',
    characterId: 1,
    planetId: 1,
    systemId: 1,
    planetType: 'temperate',
    status: 'healthy',
    extractor: { expiryMs: NOW + 50 * HOUR_MS, remainingFraction: 0.7, due: 1, total: 1 },
    slowedToFraction: null,
    storage: {
      hoursToFull: 500,
      haulHours: 168,
      fillsBeforeHaul: false,
      stallHours: 0,
      capacityM3: 10_000,
      usedM3: 1_000,
    },
    load: {
      cpu: 0.3,
      power: 0.8,
      ccLevel: 4,
      cpuUsed: 6_000,
      cpuBudget: 20_000,
      powerUsed: 13_500,
      powerBudget: 17_000,
    },
    idleFactories: 0,
    tags: [],
    action: { kind: 'details', perDay: null },
    quickWins: [],
    todayPerDay: null,
    dataAgeHours: null,
    ...overrides,
  };
}

describe('attention sort', () => {
  it('orders stopped, expiring, needs a look, unknown, healthy', () => {
    const rows = [
      row({ planetId: 1, status: 'healthy' }),
      row({ planetId: 2, status: 'unknown' }),
      row({ planetId: 3, status: 'needs-look' }),
      row({ planetId: 4, status: 'expiring' }),
      row({ planetId: 5, status: 'stopped' }),
    ];
    expect(sortRows(rows).map((r) => r.planetId)).toEqual([5, 4, 3, 2, 1]);
  });

  it('puts the sooner deadline first within a status', () => {
    const later = row({
      planetId: 1,
      status: 'expiring',
      extractor: { expiryMs: NOW + 10 * HOUR_MS, remainingFraction: 0.1, due: 1, total: 1 },
    });
    const sooner = row({
      planetId: 2,
      status: 'expiring',
      extractor: { expiryMs: NOW + 3 * HOUR_MS, remainingFraction: 0.1, due: 1, total: 1 },
    });
    expect(sortRows([later, sooner]).map((r) => r.planetId)).toEqual([2, 1]);
  });

  it('is stable for equal rows: lower planet id first', () => {
    expect(compareRows(row({ planetId: 1 }), row({ planetId: 2 }))).toBeLessThan(0);
  });

  it('does not mutate its input', () => {
    const rows = [row({ planetId: 1 }), row({ planetId: 2, status: 'stopped' })];
    sortRows(rows);
    expect(rows[0].planetId).toBe(1);
  });
});

describe('todayCheck', () => {
  const expiring = (planetId: number, hours: number, characterId = 1) =>
    row({
      key: `${characterId}:${planetId}`,
      characterId,
      planetId,
      status: hours <= 0 ? 'stopped' : 'expiring',
      extractor: { expiryMs: NOW + hours * HOUR_MS, remainingFraction: 0.1, due: 1, total: 1 },
    });

  it('counts each status, and expiring only for programs still running', () => {
    const check = todayCheck(
      [
        expiring(1, -3),
        expiring(2, 6),
        expiring(3, 14),
        row({ planetId: 4, status: 'healthy' }),
        row({ planetId: 5, status: 'needs-look' }),
        row({ planetId: 6, status: 'unknown' }),
      ],
      NOW
    );
    expect(check.counts).toEqual({
      stopped: 1,
      expiringToday: 2,
      fullBeforeHaul: 0,
      needsLook: 1,
      healthy: 1,
      unknown: 1,
    });
  });

  it('counts colonies whose storage fills before the haul', () => {
    const full = row({
      planetId: 1,
      status: 'needs-look',
      storage: {
        hoursToFull: 16,
        haulHours: 168,
        fillsBeforeHaul: true,
        stallHours: 152,
        capacityM3: 10_000,
        usedM3: 9_000,
      },
    });
    expect(todayCheck([full], NOW).counts.fullBeforeHaul).toBe(1);
  });

  it('makes the soonest deadline the next thing, and the log-in time', () => {
    const check = todayCheck([expiring(2, 14), expiring(1, 6)], NOW);
    expect(check.next).toMatchObject({ planetId: 1, kind: 'restart', stopped: false });
    expect(check.loginAtMs).toBe(NOW + 6 * HOUR_MS);
  });

  it('is "now" for a stopped colony', () => {
    const check = todayCheck([expiring(1, -3), expiring(2, 6)], NOW);
    expect(check.next).toMatchObject({ planetId: 1, stopped: true });
    expect(check.loginAtMs! <= NOW).toBe(true);
  });

  it('plans a haul at the time storage fills', () => {
    const full = row({
      planetId: 3,
      status: 'needs-look',
      extractor: { expiryMs: null, remainingFraction: null, due: 0, total: 0 },
      storage: {
        hoursToFull: 16,
        haulHours: 168,
        fillsBeforeHaul: true,
        stallHours: 152,
        capacityM3: 10_000,
        usedM3: 9_000,
      },
    });
    const check = todayCheck([full], NOW);
    expect(check.next).toMatchObject({ kind: 'haul', planetId: 3, atMs: NOW + 16 * HOUR_MS });
  });

  it('puts everything due within a day of the first login in one trip, and sums its minutes', () => {
    const check = todayCheck([expiring(1, 6), expiring(2, 20), expiring(3, 60)], NOW);
    expect(check.trip.map((item) => item.planetId)).toEqual([1, 2]);
    expect(check.tripMinutes).toBe(check.trip.reduce((sum, item) => sum + item.minutes, 0));
    expect(check.tripMinutes).toBeGreaterThan(0);
  });

  it('keeps colonies stopped long ago in the same trip as ones stopped just now', () => {
    const check = todayCheck([expiring(1, -30), expiring(2, -3), expiring(3, 6)], NOW);
    expect(check.trip.map((item) => item.planetId)).toEqual([1, 2, 3]);
  });

  it('lists each character the trip needs, in visiting order', () => {
    const check = todayCheck([expiring(1, 6, 1), expiring(2, 7, 2), expiring(3, 8, 1)], NOW);
    expect(check.tripCharacterIds).toEqual([1, 2]);
  });

  it('has nothing due, not a made-up login, for colonies with no deadline', () => {
    const check = todayCheck(
      [row({ extractor: { expiryMs: null, remainingFraction: null, due: 0, total: 0 } })],
      NOW
    );
    expect(check.next).toBeNull();
    expect(check.loginAtMs).toBeNull();
    expect(check.trip).toEqual([]);
  });

  it('leaves an unknown colony out of the deadlines', () => {
    expect(todayCheck([row({ status: 'unknown' })], NOW).due).toEqual([]);
  });
});

// --- Against the real adapter and the shared advice model ---------------------------

const ECU = 2848;
const LAUNCHPAD = 2256;
const BASIC = 2469;
const MICROORGANISMS = 2073;
const HIGHSEC = 30000142;

function pricesFor(): { prices: Record<number, number>; buyPrices: Record<number, number> } {
  const prices: Record<number, number> = {};
  const buyPrices: Record<number, number> = {};
  for (const raw of pi.raw) {
    prices[raw.typeID] = 5;
    buyPrices[raw.typeID] = 4.5;
  }
  const byTier: Record<number, number> = { 1: 1_500, 2: 36_000, 3: 140_000, 4: 1_000_000 };
  for (const key of Object.keys(pi.schematics)) {
    const typeId = Number(key);
    prices[typeId] = byTier[piTier(typeId, pi)];
    buyPrices[typeId] = prices[typeId] * 0.95;
  }
  return { prices, buyPrices };
}

function ecu(pinId: number, expiresInHours: number, installedHoursAgo = 2): PlanetPin {
  return {
    pin_id: pinId,
    type_id: ECU,
    latitude: 0.1 * pinId,
    longitude: 0.2,
    install_time: new Date(NOW - installedHoursAgo * HOUR_MS).toISOString(),
    expiry_time: new Date(NOW + expiresInHours * HOUR_MS).toISOString(),
    extractor_details: {
      heads: Array.from({ length: 7 }, (_, i) => ({ head_id: i, latitude: 0, longitude: 0 })),
      product_type_id: MICROORGANISMS,
      qty_per_cycle: 6_000,
      cycle_time: 1800,
    },
  };
}

function detail(expiresInHours: number, installedHoursAgo?: number): CharacterPlanetDetail {
  return {
    pins: [
      ecu(1, expiresInHours, installedHoursAgo),
      ecu(2, expiresInHours, installedHoursAgo),
      { pin_id: 3, type_id: LAUNCHPAD, latitude: 0.9, longitude: 0.5 },
      { pin_id: 4, type_id: BASIC, latitude: 0.9, longitude: 0.6 },
    ],
    links: [
      { source_pin_id: 3, destination_pin_id: 1, link_level: 0 },
      { source_pin_id: 3, destination_pin_id: 4, link_level: 0 },
    ],
    routes: [],
  };
}

const PLANET_ID = 40000001;
const planet: CharacterPlanet = {
  solar_system_id: HIGHSEC,
  planet_id: PLANET_ID,
  planet_type: 'temperate',
  owner_id: 1,
  last_update: '2026-09-30T00:00:00Z',
  upgrade_level: 4,
  num_pins: 4,
};

function advice(colonyDetail: CharacterPlanetDetail) {
  const snapshot: PlannerSnapshot = {
    pi,
    nowMs: NOW,
    colonies: [planet],
    details: new Map([[PLANET_ID, colonyDetail]]),
    planetRadiusKm: new Map([[PLANET_ID, 5_000]]),
    securityBySystem: new Map([[HIGHSEC, 0.95]]),
    customsSkill: 4,
  };
  return buildPlanAdvice({
    snapshot,
    prefs: { restartHours: 72, fallbackRatePerHour: 12_000, customsOverrides: {} },
    books: hubBooks(pricesFor(), 5),
    market: { kind: 'hub' },
    cadence: { restartDays: 3, haulDays: 7 },
    preference: 'isk',
    recipeFilter: 'any',
    skills: { commandCenterUpgrades: 5, interplanetaryConsolidation: 3 },
  });
}

describe('colonyCheckRow against the shared advice model', () => {
  const input = (
    colonyDetail: CharacterPlanetDetail | null,
    planAdvice: ReturnType<typeof advice> | null
  ) => ({
    characterId: 1,
    planet,
    detail: colonyDetail,
    pi,
    radiusKm: 5_000,
    nowMs: NOW,
    windowMs: WINDOW,
    haulHours: 168,
    advice: planAdvice?.colonies[0] ?? null,
  });

  it("carries the advice's own quick wins and today figure, untouched", () => {
    const d = detail(-5);
    const planAdvice = advice(d);
    const result = colonyCheckRow(input(d, planAdvice));
    expect(result.quickWins).toBe(planAdvice.colonies[0].quickWins);
    expect(result.todayPerDay).toBe(planAdvice.colonies[0].todayPerDay);
  });

  it("reads a stopped colony as stopped, with Plan's restart gain as the primary action", () => {
    const d = detail(-5);
    const planAdvice = advice(d);
    const result = colonyCheckRow(input(d, planAdvice));
    expect(result.status).toBe('stopped');
    const restartWin = planAdvice.colonies[0].quickWins.find((w) => w.detail.kind === 'restart');
    expect(restartWin).toBeDefined();
    expect(result.action).toMatchObject({
      kind: 'restart',
      stopped: true,
      gainPerDay: planAdvice.colonies[0].quickWins
        .filter((w) => w.detail.kind === 'restart')
        .reduce((sum, w) => sum + (w.gainPerDay ?? 0), 0),
    });
  });

  it('reads an expiring colony from its soonest extractor, with the share of the program left', () => {
    const d = detail(10, 14);
    const result = colonyCheckRow(input(d, advice(d)));
    expect(result.status).toBe('expiring');
    expect(result.extractor.expiryMs).toBe(NOW + 10 * HOUR_MS);
    expect(result.extractor.remainingFraction).toBeCloseTo(10 / 24, 5);
    expect(result.extractor.due).toBe(2);
  });

  it('gives a colony with no advice the same status and meters, and no money', () => {
    const d = detail(10, 14);
    const withAdvice = colonyCheckRow(input(d, advice(d)));
    const without = colonyCheckRow(input(d, null));
    expect(without.status).toBe(withAdvice.status);
    expect(without.load).toEqual(withAdvice.load);
    expect(without.storage).toEqual(withAdvice.storage);
    expect(without.todayPerDay).toBeNull();
    expect(without.quickWins).toEqual([]);
  });

  it('is unknown when the colony detail never loaded', () => {
    const result = colonyCheckRow(input(null, null));
    expect(result.status).toBe('unknown');
    expect(result.load.cpu).toBeNull();
    expect(result.storage.hoursToFull).toBeNull();
  });

  it("measures CPU and Power load as used over this colony's own budget", () => {
    const d = detail(70);
    const result = colonyCheckRow(input(d, null));
    expect(result.load.cpu).toBeGreaterThan(0);
    expect(result.load.power).toBeGreaterThan(0);
    expect(result.load.ccLevel).toBe(4);
  });

  it('tags a list that is a day old or more as stale', () => {
    const d = detail(70);
    const stale = colonyCheckRow({ ...input(d, null), dataAgeHours: 26 });
    expect(stale.tags).toContainEqual({ kind: 'stale', hours: 26 });
    const fresh = colonyCheckRow({ ...input(d, null), dataAgeHours: 3 });
    expect(fresh.tags.some((tag) => tag.kind === 'stale')).toBe(false);
  });
});
