/**
 * Command and fleet (the Improve Goal): what the fit's running bursts,
 * compressors and industrial core hand its fleet, read off `fleetSupport`
 * (`fleetSupport.ts`). Fighter DPS on fighter fits is already inside the
 * More damage goal. Pure.
 */
import type { FittingStats } from './types';

/** Summed burst buff size, mean burst reach (m), best compressor reach (m), core fuel per cycle. */
export interface CommandFigures {
  strength: number;
  burstRange: number;
  compression: number;
  fuel: number;
}

export function commandOf(s: FittingStats): CommandFigures {
  const { bursts, compressors, core } = s.fleetSupport;
  return {
    // One buff per burst counts: a second copy of the same burst hands out nothing more.
    strength: bursts.reduce((sum, burst) => sum + Math.max(0, ...burst.strengths), 0),
    burstRange:
      bursts.length === 0
        ? 0
        : bursts.reduce((sum, burst) => sum + burst.rangeMeters, 0) / bursts.length,
    compression: Math.max(0, ...compressors.map((c) => c.rangeMeters)),
    fuel: core?.fuelPerCycle ?? 0,
  };
}

/** Whether the fit gives its fleet anything this goal scores. */
export function hasCommand(s: FittingStats): boolean {
  const { strength, compression, fuel } = commandOf(s);
  return strength > 0 || compression > 0 || fuel > 0;
}

/**
 * The mean relative gain over the figures the fit already has; a figure it
 * lost counts as a full loss. A lower fuel bill is a gain.
 */
export function commandGain(before: FittingStats, after: FittingStats): number {
  const [was, now] = [commandOf(before), commandOf(after)];
  const gains: number[] = [];
  for (const key of ['strength', 'burstRange', 'compression'] as const)
    if (was[key] > 0) gains.push((now[key] - was[key]) / was[key]);
  if (was.fuel > 0) gains.push(now.fuel > 0 ? (was.fuel - now.fuel) / was.fuel : -1);
  return gains.length === 0 ? 0 : gains.reduce((sum, g) => sum + g, 0) / gains.length;
}
