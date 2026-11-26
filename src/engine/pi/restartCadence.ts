import { hasYieldBaseline, sustainedRatePerHour } from './extraction';
import type { ExtractorProgram, ExtractorYieldProgram } from './types';
import { HOUR_MS } from '@/lib/age';

export interface RestartCadenceYield {
  hours: number;
  unitsPerHour: number;
  relativeToBest: number;
}

export function restartCadenceYield({
  program,
  cadences,
}: {
  program: ExtractorProgram;
  cadences: readonly number[];
}): RestartCadenceYield[] {
  if (!hasYieldBaseline(program) || cadences.length === 0) return [];

  const rates = cadences.map((hours) => ({
    hours,
    unitsPerHour: sustainedRateForCadence(program, hours),
  }));
  const best = Math.max(0, ...rates.map((rate) => rate.unitsPerHour));

  return rates.map((rate) => ({
    ...rate,
    relativeToBest: best > 0 ? rate.unitsPerHour / best : 0,
  }));
}

function sustainedRateForCadence(program: ExtractorYieldProgram, cadenceHours: number): number {
  const shadowProgram: ExtractorYieldProgram = {
    ...program,
    expiryTimeMs: program.installTimeMs + cadenceHours * HOUR_MS,
  };
  return sustainedRatePerHour(shadowProgram);
}
