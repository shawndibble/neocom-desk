import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { neutralExtendedStats } from '@/engine/fittings/__fixtures__/fittingStats';
import type { FittingStats } from '@/engine/fittings/types';
import { fittingStatsText } from './fittingStatsText';

function layer(hp: number, ehp: number, resonance: number) {
  return {
    hp,
    ehp,
    emResonance: resonance,
    thermalResonance: resonance,
    kineticResonance: resonance,
    explosiveResonance: resonance,
  };
}

const stats = {
  ...neutralExtendedStats(),
  cpuUsed: 292.5,
  cpuTotal: 437.5,
  powergridUsed: 900,
  powergridTotal: 1062.5,
  calibrationUsed: 100,
  calibrationTotal: 400,
  droneDps: 124.6,
  droneBandwidthUsed: 25,
  droneBandwidthTotal: 75,
  ehp: 24187,
  capacitor: { stable: false, depletesInSeconds: 105 },
  shield: layer(5000, 9000, 0.5),
  armor: layer(4000, 8000, 0.4),
  hull: layer(3000, 7187, 0.67),
  targeting: {
    maxTargetRange: 60000,
    maxLockedTargets: 6,
    scanResolution: 400,
    signatureRadius: 120,
  },
  navigation: { maxVelocity: 350, agility: 0.5, mass: 10_000_000, warpSpeed: 3 },
  offense: { weapons: [], dps: 173.7, volley: 784, overheated: { dps: 181.7, volley: 830 } },
  tank: { ...neutralExtendedStats().tank, burstEffective: 90, sustainedEffective: 50 },
  capacitorBudget: { ...neutralExtendedStats().capacitorBudget, delta: -4.2 },
} as unknown as FittingStats;

describe('fittingStatsText', () => {
  it('writes the headline stats one line each, ready to paste into chat', () => {
    const text = fittingStatsText(stats, i18n.t.bind(i18n));

    expect(text.split('\n')).toEqual([
      'DPS 173.7 (181.7 overheated) · volley 784',
      'EHP 24187 · shield 5000 HP · armor 4000 HP · hull 3000 HP',
      'Resists EM/Th/Kin/Exp: shield 50/50/50/50 · armor 60/60/60/60 · hull 33/33/33/33',
      'Tank 90.0 EHP/s burst · 50.0 EHP/s sustained',
      'Capacitor Depletes in 105s · delta −4.2 GJ/s',
      'Speed 350 m/s · align 6.9 s · warp 3.0 AU/s',
      'Targeting 60.0 km · 6 targets · 400 mm · signature 120 m',
      'Drones 124.6 DPS · 25 / 75 Mbit/s',
      'CPU 292.5 / 437.5 · PG 900.0 / 1062.5 · calibration 100 / 400',
    ]);
  });

  it('says every figure is overheated when it is', () => {
    const text = fittingStatsText(
      { ...stats, allOverheated: true, overheated: null },
      i18n.t.bind(i18n)
    );
    expect(text.split('\n')[0]).toBe('All figures overheated');
  });
});
