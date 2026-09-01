/**
 * Jump clone cooldown: EVE limits how often a character can jump between
 * clones. Base 24 hours, reduced by 1 hour per level of Infomorph
 * Synchronizing, floored at 0. `now` is a parameter rather than read from the
 * clock inside the calculation, so it stays a pure, testable function.
 */

/** Infomorph Synchronizing (public/data/skills.json): "Reduced time between clone jumps by 1 hour per level." */
export const INFOMORPH_SYNCHRONIZING_SKILL_ID = 33399;

export function cloneJumpCooldownHours(infomorphSynchronizingLevel: number): number {
  return Math.max(0, 24 - infomorphSynchronizingLevel);
}

export interface CloneJumpCooldown {
  /** Whether a clone jump right now would still be blocked by the cooldown. */
  onCooldown: boolean;
  /** When the cooldown clears; null when there's no last-jump date to measure from. */
  readyAt: Date | null;
}

export function cloneJumpCooldown(
  lastCloneJumpDate: string | null | undefined,
  infomorphSynchronizingLevel: number,
  now: Date
): CloneJumpCooldown {
  if (!lastCloneJumpDate) return { onCooldown: false, readyAt: null };
  const last = new Date(lastCloneJumpDate);
  if (Number.isNaN(last.getTime())) return { onCooldown: false, readyAt: null };
  const readyAt = new Date(
    last.getTime() + cloneJumpCooldownHours(infomorphSynchronizingLevel) * 3_600_000
  );
  return { onCooldown: readyAt.getTime() > now.getTime(), readyAt };
}
