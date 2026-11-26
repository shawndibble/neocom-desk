import type { FittingStats } from '../types';

export interface CommandFigures {
  strength: number;
  burstRange: number;
  compression: number;
  fuel: number;
}

export function commandOf(s: FittingStats): CommandFigures {
  const { bursts, compressors, core } = s.fleetSupport;
  return {
    strength: bursts.reduce((sum, burst) => sum + Math.max(0, ...burst.strengths), 0),
    burstRange:
      bursts.length === 0
        ? 0
        : bursts.reduce((sum, burst) => sum + burst.rangeMeters, 0) / bursts.length,
    compression: Math.max(0, ...compressors.map((c) => c.rangeMeters)),
    fuel: core?.fuelPerCycle ?? 0,
  };
}

export function hasCommand(s: FittingStats): boolean {
  const { strength, compression, fuel } = commandOf(s);
  return strength > 0 || compression > 0 || fuel > 0;
}

export function commandGain(before: FittingStats, after: FittingStats): number {
  const [was, now] = [commandOf(before), commandOf(after)];
  const gains: number[] = [];
  for (const key of ['strength', 'burstRange', 'compression'] as const)
    if (was[key] > 0) gains.push((now[key] - was[key]) / was[key]);
  if (was.fuel > 0) gains.push(now.fuel > 0 ? (was.fuel - now.fuel) / was.fuel : -1);
  return gains.length === 0 ? 0 : gains.reduce((sum, g) => sum + g, 0) / gains.length;
}
