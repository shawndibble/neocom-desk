/**
 * "Copy stats as text": a Fitting's headline stats as plain lines, to paste
 * into chat or a doc. Every label goes through i18next like the rest of the
 * stats column; the numbers are rounded as the column shows them.
 */
import { alignTimeSeconds, resistPct } from '@/engine/fittings/stats';
import type { FittingStats, Resonances } from '@/engine/fittings/types';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function resists(layer: Resonances): string {
  return [
    layer.emResonance,
    layer.thermalResonance,
    layer.kineticResonance,
    layer.explosiveResonance,
  ]
    .map((resonance) => resistPct(resonance).toFixed(0))
    .join('/');
}

/** A signed figure with a true minus, as the stats column shows a delta. */
function signed(value: number, digits: number): string {
  const magnitude = Math.abs(value).toFixed(digits);
  if (Number(magnitude) === 0) return magnitude;
  return value < 0 ? `−${magnitude}` : `+${magnitude}`;
}

export function fittingStatsText(stats: FittingStats, t: Translate): string {
  const k = (key: string, options?: Record<string, unknown>) =>
    t(`fittings.stats.copyText.${key}`, options);
  const heatedDps =
    stats.offense.overheated &&
    stats.offense.overheated.dps.toFixed(1) !== stats.offense.dps.toFixed(1)
      ? k('dpsOverheated', { value: stats.offense.overheated.dps.toFixed(1) })
      : '';
  const capacitor = stats.capacitor.stable
    ? t('fittings.stats.capacitorStable', { pct: stats.capacitor.stablePercentage.toFixed(0) })
    : t('fittings.stats.capacitorDepletes', {
        seconds: stats.capacitor.depletesInSeconds.toFixed(0),
      });

  const lines = [
    ...(stats.allOverheated ? [k('allOverheated')] : []),
    k('dps', {
      dps: stats.offense.dps.toFixed(1),
      overheated: heatedDps,
      volley: stats.offense.volley.toFixed(0),
    }),
    k('ehp', {
      ehp: stats.ehp.toFixed(0),
      shield: stats.shield.hp.toFixed(0),
      armor: stats.armor.hp.toFixed(0),
      hull: stats.hull.hp.toFixed(0),
    }),
    k('resists', {
      shield: resists(stats.shield),
      armor: resists(stats.armor),
      hull: resists(stats.hull),
    }),
    k('tank', {
      burst: stats.tank.burstEffective.toFixed(1),
      sustained: stats.tank.sustainedEffective.toFixed(1),
    }),
    k('capacitor', { state: capacitor, delta: signed(stats.capacitorBudget.delta, 1) }),
    k('navigation', {
      speed: stats.navigation.maxVelocity.toFixed(0),
      align: alignTimeSeconds(stats.navigation.mass, stats.navigation.agility).toFixed(1),
      warp: stats.navigation.warpSpeed.toFixed(1),
    }),
    k('targeting', {
      range: (stats.targeting.maxTargetRange / 1000).toFixed(1),
      targets: stats.targeting.maxLockedTargets,
      scanResolution: stats.targeting.scanResolution.toFixed(0),
      signature: stats.targeting.signatureRadius.toFixed(0),
    }),
    ...(stats.droneBandwidthTotal > 0 || stats.droneDps > 0
      ? [
          k('drones', {
            dps: stats.droneDps.toFixed(1),
            used: stats.droneBandwidthUsed.toFixed(0),
            total: stats.droneBandwidthTotal.toFixed(0),
          }),
        ]
      : []),
    k('fitting', {
      cpuUsed: stats.cpuUsed.toFixed(1),
      cpuTotal: stats.cpuTotal.toFixed(1),
      pgUsed: stats.powergridUsed.toFixed(1),
      pgTotal: stats.powergridTotal.toFixed(1),
      calibrationUsed: stats.calibrationUsed.toFixed(0),
      calibrationTotal: stats.calibrationTotal.toFixed(0),
    }),
  ];
  return lines.join('\n');
}
