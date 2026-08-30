/**
 * Remaps Available (CONTEXT.md): bonus remaps (new characters get several)
 * plus the yearly remap when off cooldown, read from ESI's attributes
 * endpoint. This is a prefill/hint only — the user may override the plan's
 * remapCount freely.
 */
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
