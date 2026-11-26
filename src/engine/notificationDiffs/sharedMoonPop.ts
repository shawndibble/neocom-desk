import { HOUR_MS } from '@/lib/age';

export type SharedPopTime = 'ready' | 'auto-fracture';

export interface SharedMoonPopEntrySnapshot {
  popId: string;
  corporationId: number;
  refineryName: string | null;
  popTime: SharedPopTime;
  popAtMs: number;
  ratePct: number;
  leadMs: number;
  muted?: boolean;
}

export interface SharedMoonPopSnapshot {
  entries: readonly SharedMoonPopEntrySnapshot[];
  nowMs: number;
}

export interface SharedMoonPopFire {
  eventId: 'sharedMoonPop';
  characterId: number;
  popId: string;
  corporationId: number;
  refineryName: string | null;
  popTime: SharedPopTime;
  popAtMs: number;
  ratePct: number;
  thresholdMs: number;
  early?: true;
}

const LATE_LIMIT_MS = HOUR_MS;
export const EARLY_LATE_LIMIT_MS = 12 * HOUR_MS;

export function sharedMoonPopFire(
  characterId: number,
  entry: SharedMoonPopEntrySnapshot
): SharedMoonPopFire {
  return {
    eventId: 'sharedMoonPop',
    characterId,
    popId: entry.popId,
    corporationId: entry.corporationId,
    refineryName: entry.refineryName,
    popTime: entry.popTime,
    popAtMs: entry.popAtMs,
    ratePct: entry.ratePct,
    thresholdMs: entry.leadMs,
  };
}

export function diffSharedMoonPop(
  characterId: number,
  prev: SharedMoonPopSnapshot | undefined,
  next: SharedMoonPopSnapshot
): SharedMoonPopFire[] {
  if (!prev) return [];
  const prevAt = new Map(prev.entries.map((e) => [e.popId, e.popAtMs]));
  return next.entries.flatMap((entry) => {
    if (entry.muted === true) return [];
    const was = prevAt.get(entry.popId);
    const fireAt = entry.popAtMs - entry.leadMs;
    if (
      was !== undefined &&
      entry.popAtMs < was &&
      fireAt <= prev.nowMs &&
      next.nowMs - entry.popAtMs <= EARLY_LATE_LIMIT_MS
    ) {
      const fire = sharedMoonPopFire(characterId, entry);
      return [entry.popAtMs <= next.nowMs ? { ...fire, early: true as const } : fire];
    }
    const crossed =
      fireAt > prev.nowMs && fireAt <= next.nowMs && next.nowMs - fireAt <= LATE_LIMIT_MS;
    return crossed ? [sharedMoonPopFire(characterId, entry)] : [];
  });
}

export function sharedMoonPopPath(popId: string): string {
  return `/calendar?pop=${encodeURIComponent(popId)}`;
}

const KEY_PREFIX = 'sharedMoonPop:';

export function sharedPopIdOfOccurrenceKey(key: string): string | undefined {
  if (!key.startsWith(KEY_PREFIX)) return undefined;
  const popId = key.slice(KEY_PREFIX.length).split(':')[0];
  return popId === '' ? undefined : popId;
}
