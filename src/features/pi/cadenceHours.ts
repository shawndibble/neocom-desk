import type { PiCadence } from './cadencePref';

const HOURS_PER_DAY = 24;

export interface CadenceHours {
  restartHours: number;
  haulHours: number;
}

export function cadenceHours(cadence: PiCadence): CadenceHours {
  return {
    restartHours: cadence.restartDays * HOURS_PER_DAY,
    haulHours: cadence.haulDays * HOURS_PER_DAY,
  };
}
