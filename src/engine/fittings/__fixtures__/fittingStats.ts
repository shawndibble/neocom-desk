import { NO_EXPLORE } from '../explore';
import { NO_MODULE_FIGURES } from '../moduleFigures';
import type { FittingStats, HoldStats } from '../types';

/** Every hold empty: spread into a test's `holds` so a new hold lands here once. */
export const NO_HOLDS: HoldStats = {
  cargo: 0,
  fleetHangar: 0,
  miningHold: 0,
  ammoHold: 0,
  planetaryHold: 0,
  commandCenterHold: 0,
  mineralHold: 0,
  gasHold: 0,
  iceHold: 0,
  fuelBay: 0,
  infrastructureHold: 0,
};

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
  | 'explore'
  | 'moduleFigures'
  | 'fleetSupport'
  | 'fighters'
  | 'sensor'
  | 'holds'
  | 'jumpDrive'
  | 'lockedTargets'
  | 'ruleBreaks'
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
    explore: NO_EXPLORE,
    moduleFigures: NO_MODULE_FIGURES,
    fleetSupport: { bursts: [], compressors: [], core: null },
    support: {
      rows: [],
      remoteRepair: { shield: 0, armor: 0, hull: 0 },
      capTransfer: 0,
      neutralizer: 0,
      nosferatu: 0,
    },
    sensor: { strength: 0, type: null },
    holds: NO_HOLDS,
    jumpDrive: null,
    lockedTargets: { ship: 0, pilot: 2, effective: 0 },
    ruleBreaks: [],
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

function layer(hp: number) {
  return {
    hp,
    ehp: hp,
    emResonance: 1,
    thermalResonance: 1,
    kineticResonance: 1,
    explosiveResonance: 1,
  };
}

/** A whole, plain combat fit's stats: 100 DPS, 1,000 EHP, 200 m/s, a stable capacitor. */
export function baseFittingStats(): FittingStats {
  return {
    cpuUsed: 0,
    cpuTotal: 100,
    powergridUsed: 0,
    powergridTotal: 100,
    calibrationUsed: 0,
    calibrationTotal: 400,
    droneDps: 0,
    droneBandwidthUsed: 0,
    droneBandwidthTotal: 0,
    maxActiveDrones: 0,
    droneBandwidthByType: {},
    hardpoints: { turrets: 0, launchers: 0 },
    droneCapacity: 0,
    ehp: 1000,
    capacitor: { stable: true, stablePercentage: 50 },
    capacitorCapacity: 1500,
    capacitorRechargeTime: 300000,
    shield: layer(400),
    armor: layer(300),
    hull: layer(300),
    targeting: {
      maxTargetRange: 60000,
      maxLockedTargets: 6,
      scanResolution: 400,
      signatureRadius: 120,
    },
    navigation: { maxVelocity: 200, agility: 4, mass: 10_000_000, warpSpeed: 3 },
    unknownItemTypeIds: [],
    applied: { weapons: [], droneControlRange: 20000 },
    slotCounts: { high: 4, medium: 4, low: 4, rig: 3, subsystem: 0 },
    modules: [],
    offense: {
      weapons: [],
      dps: 100,
      sustainedDps: 100,
      volley: 500,
      overheated: null,
      chargelessWeaponCount: 0,
    },
    repair: { shield: 0, armor: 0, hull: 0 },
    overheated: null,
    ...neutralExtendedStats(),
  } as FittingStats;
}
