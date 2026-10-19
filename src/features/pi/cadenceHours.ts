/** The pure half of `cadencePref.ts`, free of the settings store so the advice worker can import it. */
import type { PiCadence } from './cadencePref';

const HOURS_PER_DAY = 24;

export interface CadenceHours {
  restartHours: number;
  haulHours: number;
}

/** The pair in the unit `checkThroughput` and the extraction curve both speak. */
export function cadenceHours(cadence: PiCadence): CadenceHours {
  return {
    restartHours: cadence.restartDays * HOURS_PER_DAY,
    haulHours: cadence.haulDays * HOURS_PER_DAY,
  };
}
