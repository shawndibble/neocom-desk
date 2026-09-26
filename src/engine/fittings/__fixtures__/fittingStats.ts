import type { FittingStats } from '../types';

/**
 * The FittingStats fields a test about something else doesn't care about,
 * at neutral values — spread into a fixture so a new stats field lands here
 * once rather than in every test's literal.
 */
export function neutralExtendedStats(): Pick<
  FittingStats,
  | 'capacitorBudget'
  | 'tank'
  | 'support'
  | 'mining'
  | 'fighters'
  | 'sensor'
  | 'holds'
  | 'jumpDrive'
  | 'lockedTargets'
  | 'allOverheated'
  | 'unheated'
> {
  return {
    fighters: {
      dps: 0,
      tubes: { used: 0, total: 0 },
      light: { used: 0, total: 0 },
      support: { used: 0, total: 0 },
      heavy: { used: 0, total: 0 },
      bay: { used: 0, total: 0 },
    },
    mining: { rows: [], perSecond: 0, perHour: 0, wastePerSecond: 0, wastePct: 0 },
    support: {
      rows: [],
      remoteRepair: { shield: 0, armor: 0, hull: 0 },
      capTransfer: 0,
      neutralizer: 0,
      nosferatu: 0,
    },
    sensor: { strength: 0, type: null },
    holds: { cargo: 0, fleetHangar: 0, miningHold: 0 },
    jumpDrive: null,
    lockedTargets: { ship: 0, pilot: 2, effective: 0 },
    allOverheated: false,
    unheated: null,
    capacitorBudget: {
      peakRecharge: 0,
      drain: 0,
      boosterInjection: 0,
      nosferatuGain: 0,
      delta: 0,
      deltaPct: 0,
      secondsPerBoosterCharge: null,
    },
    tank: {
      burst: { shield: 0, armor: 0, hull: 0 },
      sustained: { shield: 0, armor: 0, hull: 0 },
      passiveShield: 0,
      burstEffective: 0,
      sustainedEffective: 0,
      capFraction: 1,
      ancillary: [],
    },
  };
}
