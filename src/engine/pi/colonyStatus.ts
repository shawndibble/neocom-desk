import { hasYieldBaseline, pastEfficientWindow } from './extraction';
import type { ColonyAttention, ColonyStatus, ExtractorProgram, ExtractorState } from './types';
import { HOUR_MS } from '@/lib/age';

export const EXPIRING_SOON_WINDOW_MS = 24 * HOUR_MS;

export const EFFICIENT_WINDOW_FRACTION = 0.35;

export function extractorState(
  expiryTimeMs: number,
  nowMs: number,
  expiringSoonWindowMs: number = EXPIRING_SOON_WINDOW_MS
): ExtractorState {
  if (nowMs >= expiryTimeMs) return 'expired';
  if (expiryTimeMs - nowMs <= expiringSoonWindowMs) return 'expiring-soon';
  return 'active';
}

export function colonyStatus(programs: readonly ExtractorProgram[], nowMs: number): ColonyStatus {
  if (programs.length === 0) return { idle: false, soonestExpiryMs: null };
  const projectable = programs.filter(hasYieldBaseline);
  return {
    idle: programs.some((program) => nowMs >= program.expiryTimeMs),
    soonestExpiryMs: Math.min(...programs.map((program) => program.expiryTimeMs)),
    ...(projectable.length > 0
      ? {
          decayed: projectable.every((program) =>
            pastEfficientWindow(program, nowMs, EFFICIENT_WINDOW_FRACTION)
          ),
        }
      : {}),
  };
}

export function colonyAttention(
  status: ColonyStatus,
  nowMs: number,
  expiringSoonWindowMs: number = EXPIRING_SOON_WINDOW_MS
): ColonyAttention {
  if (status.idle) return 'idle';
  if (status.soonestExpiryMs !== null && status.soonestExpiryMs - nowMs <= expiringSoonWindowMs)
    return 'expiring-soon';
  if (status.decayed === true) return 'decayed';
  return 'healthy';
}

export const ATTENTION_RANK: Record<ColonyAttention, number> = {
  idle: 0,
  'expiring-soon': 1,
  decayed: 2,
  healthy: 3,
};

export const ATTENTION_TONE: Record<ColonyAttention, 'danger' | 'warning' | 'accent' | 'success'> =
  {
    idle: 'danger',
    'expiring-soon': 'warning',
    decayed: 'accent',
    healthy: 'success',
  };

export function sortColoniesByAttention<T>(
  colonies: readonly T[],
  statusOf: (colony: T) => ColonyStatus,
  nowMs: number,
  expiringSoonWindowMs: number = EXPIRING_SOON_WINDOW_MS
): T[] {
  return [...colonies].sort((a, b) => {
    const sa = statusOf(a);
    const sb = statusOf(b);
    const rankDiff =
      ATTENTION_RANK[colonyAttention(sa, nowMs, expiringSoonWindowMs)] -
      ATTENTION_RANK[colonyAttention(sb, nowMs, expiringSoonWindowMs)];
    if (rankDiff !== 0) return rankDiff;
    if (sa.soonestExpiryMs === null || sb.soonestExpiryMs === null) return 0;
    return sa.soonestExpiryMs - sb.soonestExpiryMs;
  });
}
