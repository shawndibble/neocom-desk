import { createLocalSetting } from '@/lib/useLocalSetting';

export const PI_CADENCE_KEY = 'piCadence';

export const PI_CADENCE_DAYS = [1, 2, 3, 7, 14] as const;

export type PiCadenceDays = (typeof PI_CADENCE_DAYS)[number];

export interface PiCadence {
  restartDays: PiCadenceDays;
  haulDays: PiCadenceDays;
}

export const DEFAULT_PI_CADENCE: PiCadence = { restartDays: 1, haulDays: 1 };

export { cadenceHours, type CadenceHours } from './cadenceHours';

function isOfferedDays(value: unknown): value is PiCadenceDays {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (PI_CADENCE_DAYS as readonly number[]).includes(value)
  );
}

export function parsePiCadence(raw: unknown): PiCadence | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { restartDays, haulDays } = raw as Partial<PiCadence>;
  if (!isOfferedDays(restartDays) || !isOfferedDays(haulDays)) return null;
  return { restartDays, haulDays };
}

export const useCadence = createLocalSetting<PiCadence>({
  key: PI_CADENCE_KEY,
  defaultValue: DEFAULT_PI_CADENCE,
  parse: parsePiCadence,
});
