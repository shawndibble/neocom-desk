/**
 * A small hand-built `PlanAdvice` for the Plan view tests: one colony to
 * rebuild (with an alternative and a Command Center fit), one to keep, and two
 * quick wins. Only the fields the view model reads are real.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { QuickWin, RebuildOption } from '@/engine/pi/planAdvice';
import type { PlanAdvice, PlanColonyAdvice } from './planAdviceModel';
import { piItemName } from './planView';

export const fixturePi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;
const pi = fixturePi;

export const [P2_A, P2_B] = Object.keys(pi.schematics)
  .filter((id) => pi.schematics[id].inputs.length > 1)
  .map(Number);
export const RAW = pi.raw[0].typeID;

function option(typeId: number, iskPerDay: number, m3PerDay: number): RebuildOption {
  return {
    typeId,
    name: piItemName(typeId, pi),
    tier: 2,
    iskPerDay,
    m3PerDay,
    unitsPerDay: 10,
    pins: {},
    recipe: { extracts: [RAW], makes: [{ typeId, facility: 'advanced' }] },
    needsCcLevel: null,
    gainPerDay: 0,
  };
}

const win = (planetId: number, kind: 'restart' | 'storage', gain: number | null): QuickWin => ({
  id: `${planetId}:${kind}`,
  planetId,
  detail:
    kind === 'restart'
      ? { kind: 'restart', reason: 'stopped', extractors: 1, resourceTypeIds: [RAW] }
      : { kind: 'storage', hoursToFull: 16, haulHours: 24 },
  gainPerDay: gain,
  minutes: 2,
  iskPerMinute: gain === null ? null : gain / 2,
});

export function colony(over: Partial<PlanColonyAdvice> & { planetId: number }): PlanColonyAdvice {
  return {
    planetType: 'barren',
    todayPerDay: 1000,
    unknownReason: null,
    quickWins: [],
    quickWinGainPerDay: 0,
    afterQuickWinsPerDay: 1000,
    rebuild: { status: 'refused', planetId: over.planetId, reason: 'x' },
    afterRebuildPerDay: 1000,
    name: null,
    anchor: `plan-p${over.planetId}`,
    systemId: 1,
    upgradeLevel: 4,
    taxRate: 0.1,
    taxAssumed: false,
    rebuildFit: null,
    sells: [],
    ...over,
  };
}

const changePick = option(P2_A, 5000, 100);
const changing = colony({
  planetId: 1,
  name: 'Hek VI',
  sells: [RAW],
  quickWins: [win(1, 'restart', 300)],
  quickWinGainPerDay: 300,
  afterQuickWinsPerDay: 1300,
  rebuild: {
    status: 'change',
    planetId: 1,
    planetType: 'barren',
    todayPerDay: 1300,
    best: changePick,
    alternative: option(P2_B, 4000, 25),
    pick: changePick,
    gainPerDay: 3700,
    steps: [
      { verb: 'remove', pin: 'extractorControlUnit', count: 1, minutes: 1 },
      { verb: 'set', pin: 'advanced', typeId: P2_A, count: 1, minutes: 1 },
      { verb: 'route', count: 1, minutes: 2 },
    ],
    minutes: 4,
    upgradeFromLevel: null,
  },
  afterRebuildPerDay: 5000,
  rebuildFit: {
    level: 4,
    used: { cpu: 250, powergrid: 550 },
    budget: { cpu: 1000, powergrid: 1000 },
  },
});
const keeping = colony({
  planetId: 2,
  name: 'Uttindar II',
  sells: [P2_B],
  // A storage win saves; it adds nothing to the colony's figures.
  quickWins: [win(2, 'storage', 120)],
  quickWinGainPerDay: 0,
  afterQuickWinsPerDay: 1000,
  rebuild: {
    status: 'keep',
    planetId: 2,
    planetType: 'barren',
    todayPerDay: 1000,
    best: option(P2_B, 1000, 50),
    alternative: null,
    reason: 'already-best',
  },
  afterRebuildPerDay: 1000,
});

export const fixtureAdvice = {
  preference: 'isk',
  market: { kind: 'hub' },
  colonies: [changing, keeping],
  excluded: [],
  quickWins: [win(1, 'restart', 300), win(2, 'storage', 120)],
  totals: {
    todayPerDay: 2000,
    afterQuickWinsPerDay: 2300,
    afterRebuildPerDay: 6000,
    quickWinMinutes: 4,
    rebuildMinutes: 4,
    unknownColonies: 0,
    unpricedQuickWins: 0,
  },
  haul: {
    haulDays: 7,
    restartDays: 3,
    tripsPerWeek: 1,
    m3PerTrip: 700,
    todayM3PerTrip: 800,
    complete: true,
    fit: {
      fits: { frigate: false, industrial: true, epithal: true },
      smallest: 'industrial',
      industrialTrips: 1,
    },
    route: { kind: 'local' },
  },
  slots: {
    used: 2,
    allowed: 4,
    free: 2,
    assumed: false,
    canTrainMore: true,
    gainPerPlanetPerDay: 900,
  },
  recipes: {},
  rankingBasis: {},
} as unknown as PlanAdvice;
