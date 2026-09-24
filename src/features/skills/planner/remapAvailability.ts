/**
 * Remaps Available (CONTEXT.md): bonus remaps (new characters get several)
 * plus the yearly remap when off cooldown, read from ESI's attributes
 * endpoint. This is a prefill/hint only — the user may override the plan's
 * remapCount freely.
 */
import { MAX_SUPPORTED_REMAPS } from '@/engine/optimizer';
import type { CharacterAttributes } from '@/esi/endpoints';

export interface RemapAvailability {
  /** bonus + (1 if the yearly remap is ready). */
  available: number;
  bonus: number;
  yearlyReady: boolean;
  /** Yearly-remap cooldown end from ESI; null when absent or unparseable. */
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
  /** bonus + 1 (the on-cooldown yearly remap), capped at MAX_SUPPORTED_REMAPS. */
  remapCount: number;
  /** Cooldown end, as seconds into a plan starting at `planStart`. */
  notBeforeSeconds: number;
}

/**
 * `placeRemaps`' `timedRemap` option, derived from ESI's Remaps Available:
 * an on-cooldown yearly remap is still usable, just not before its cooldown
 * ends. Null whenever there is nothing to constrain at all — no ESI data,
 * the yearly remap is already off cooldown, or 2+ bonus remaps already fill
 * the cap (the decided trade: spend those and drop the yearly one).
 *
 * A cooldown that has *already* passed by `planStart` — `info` is only
 * stale relative to the `now` it was fetched against — still raises the
 * count, just with `notBeforeSeconds` floored at 0 (no floor at all):
 * dropping it here would contradict "usable from its cooldown date" for a
 * remap that, as of the plan, already is.
 */
export function timedRemapFrom(info: RemapAvailability | null, planStart: Date): TimedRemap | null {
  if (!info || info.yearlyReady || !info.cooldownUntil) return null;
  if (info.bonus >= MAX_SUPPORTED_REMAPS) return null;
  const notBeforeSeconds = (info.cooldownUntil.getTime() - planStart.getTime()) / 1000;
  // `info.bonus < MAX_SUPPORTED_REMAPS` already, from the guard above, so
  // `bonus + 1` never needs its own cap.
  return { remapCount: info.bonus + 1, notBeforeSeconds: Math.max(0, notBeforeSeconds) };
}
