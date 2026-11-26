import { HOUR_MS } from '@/lib/age';

export const INFOMORPH_SYNCHRONIZING_SKILL_ID = 33399;

export function cloneJumpCooldownHours(infomorphSynchronizingLevel: number): number {
  return Math.max(0, 24 - infomorphSynchronizingLevel);
}

export interface CloneJumpCooldown {
  onCooldown: boolean;
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
    last.getTime() + cloneJumpCooldownHours(infomorphSynchronizingLevel) * HOUR_MS
  );
  return { onCooldown: readyAt.getTime() > now.getTime(), readyAt };
}
