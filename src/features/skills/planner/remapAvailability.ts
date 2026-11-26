import { MAX_SUPPORTED_REMAPS } from '@/engine/optimizer';
import type { CharacterAttributes } from '@/esi/endpoints';

export interface RemapAvailability {
  available: number;
  bonus: number;
  yearlyReady: boolean;
  cooldownUntil: Date | null;
}

export function remapAvailability(
  attrs:
    Pick<CharacterAttributes, 'bonus_remaps' | 'accrued_remap_cooldown_date'> | null | undefined,
  now: Date
): RemapAvailability | null {
  if (!attrs) return null;
  const bonus = attrs.bonus_remaps ?? 0;
  const cooldown = attrs.accrued_remap_cooldown_date
    ? new Date(attrs.accrued_remap_cooldown_date)
    : null;
  const validCooldown = cooldown && !Number.isNaN(cooldown.getTime()) ? cooldown : null;
  const yearlyReady = validCooldown === null || validCooldown.getTime() <= now.getTime();
  return {
    available: bonus + (yearlyReady ? 1 : 0),
    bonus,
    yearlyReady,
    cooldownUntil: validCooldown,
  };
}

export interface TimedRemap {
  remapCount: number;
  notBeforeSeconds: number;
}

export function timedRemapFrom(info: RemapAvailability | null, planStart: Date): TimedRemap | null {
  if (!info || info.yearlyReady || !info.cooldownUntil) return null;
  if (info.bonus >= MAX_SUPPORTED_REMAPS) return null;
  const notBeforeSeconds = (info.cooldownUntil.getTime() - planStart.getTime()) / 1000;
  return { remapCount: info.bonus + 1, notBeforeSeconds: Math.max(0, notBeforeSeconds) };
}

export interface RemapBudget {
  count: number;
  evaluatedCount: number;
  timed: TimedRemap | null;
}

export function remapBudget(
  info: RemapAvailability | null,
  stored: number,
  planStart: Date
): RemapBudget {
  const timed = info ? timedRemapFrom(info, planStart) : null;
  const count = info ? (timed ? timed.remapCount : info.available) : stored;
  const evaluatedCount = Math.min(count, MAX_SUPPORTED_REMAPS);
  return { count, evaluatedCount, timed };
}
