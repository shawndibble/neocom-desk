import { ATTRIBUTE_NAMES } from '@/engine/optimizer';
import type { Attributes, Booster } from '@/engine/types';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';

export const MAX_BOOSTER_BONUS = 30;
const MIN_BOOSTER_BONUS = 0;

export const DEFAULT_ACCELERATOR_BONUS = 3;

export function clampBoosterBonus(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.NaN;
  if (Number.isNaN(value)) return MIN_BOOSTER_BONUS;
  return Math.min(MAX_BOOSTER_BONUS, Math.max(MIN_BOOSTER_BONUS, Math.round(value)));
}

export function acceleratorBoosters(
  accelerator: CharacterAcceleratorInput | null | undefined
): Booster[] {
  if (!accelerator) return [];
  const bonus: Partial<Attributes> = {};
  for (const name of ATTRIBUTE_NAMES) bonus[name] = clampBoosterBonus(accelerator.bonus);
  return [{ bonus, expiresAt: new Date(accelerator.expiresAt) }];
}

export interface CharacterAcceleratorInput {
  bonus: number;
  expiresAt: number;
}

export interface BoosterDuration {
  days: number;
  hours: number;
  minutes: number;
}

export function splitBoosterDuration(expiresAt: number, now: number): BoosterDuration {
  const remaining = Math.max(0, expiresAt - now);
  const total = Math.ceil(remaining / MINUTE_MS);
  return {
    days: Math.floor(total / (24 * 60)),
    hours: Math.floor(total / 60) % 24,
    minutes: total % 60,
  };
}

export function joinBoosterDuration({ days, hours, minutes }: BoosterDuration): number {
  return days * DAY_MS + hours * HOUR_MS + minutes * MINUTE_MS;
}
