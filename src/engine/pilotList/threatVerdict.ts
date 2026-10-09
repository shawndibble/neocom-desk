/**
 * The **Threat** verdict: how much a pilot's recent kills say they are worth
 * worrying about. Pure; the kill list and the danger ratio are fetched in
 * `src/lib/zkillboard.ts`. It reads kills only (a pilot's recent losses are not
 * fetched), so it is a read of how active and how deadly they have been, never
 * a statement that anyone is safe: the lowest level is "low", not "safe".
 */
import type { KillRecord, KillSpace } from './killActivity';

export type ThreatLevel = 'dangerous' | 'active' | 'low' | 'inactive';

/** How far back the verdict looks. Kills older than this count for nothing. */
export const THREAT_WINDOW_DAYS = 90;
/** Recent kills it takes to be "active". */
export const ACTIVE_MIN_KILLS = 3;
/** Recent kills it takes to be "dangerous", together with `DANGEROUS_MIN_DANGER_RATIO`. */
export const DANGEROUS_MIN_KILLS = 10;
/** zKillboard's all-time danger ratio (0-100) a pilot needs to be "dangerous". */
export const DANGEROUS_MIN_DANGER_RATIO = 50;

const DAY_MS = 86_400_000;
/** Capsule and its Genolution variant: the two pod hulls. */
const POD_TYPE_IDS: ReadonlySet<number> = new Set([670, 33328]);
/** When two kinds of space tie, the one that is worse to meet a pilot in wins. */
const SPACE_PRIORITY: readonly KillSpace[] = ['nullsec', 'wormhole', 'lowsec', 'highsec'];

export interface ThreatVerdict {
  level: ThreatLevel;
  /** Kills inside the 90-day window. */
  recentKills: number;
  /** The newest kill, any age; null when the list is empty. */
  lastKillMs: number | null;
  /** The kind of space most recent kills were in; null when none of them say. */
  mainSpace: KillSpace | null;
  /** Capsules as a 0-1 share of recent kills; null when there are none. */
  podShare: number | null;
  /** False when no danger ratio was given, so "dangerous" was out of reach. */
  dangerKnown: boolean;
}

function recentKillsOf(kills: readonly KillRecord[], nowMs: number): KillRecord[] {
  const since = nowMs - THREAT_WINDOW_DAYS * DAY_MS;
  return kills.filter((kill) => kill.timeMs >= since);
}

/**
 * Whether the danger ratio can change this pilot's level: only a pilot with
 * enough recent kills can be "dangerous", so every other pilot's verdict is
 * already final and no stats fetch is needed for it.
 */
export function needsDangerRatio(kills: readonly KillRecord[], nowMs: number): boolean {
  return recentKillsOf(kills, nowMs).length >= DANGEROUS_MIN_KILLS;
}

export function threatVerdict({
  kills,
  dangerRatio,
  nowMs,
}: {
  kills: readonly KillRecord[];
  /** zKillboard's all-time danger ratio, 0-100; null when unknown. */
  dangerRatio: number | null;
  nowMs: number;
}): ThreatVerdict {
  const recent = recentKillsOf(kills, nowMs);
  let level: ThreatLevel;
  if (recent.length === 0) level = 'inactive';
  else if (
    recent.length >= DANGEROUS_MIN_KILLS &&
    dangerRatio !== null &&
    dangerRatio >= DANGEROUS_MIN_DANGER_RATIO
  )
    level = 'dangerous';
  else if (recent.length >= ACTIVE_MIN_KILLS) level = 'active';
  else level = 'low';

  let lastKillMs: number | null = null;
  for (const kill of kills)
    if (lastKillMs === null || kill.timeMs > lastKillMs) lastKillMs = kill.timeMs;

  const counts = new Map<KillSpace, number>();
  for (const kill of recent) {
    if (kill.space !== null) counts.set(kill.space, (counts.get(kill.space) ?? 0) + 1);
  }
  let mainSpace: KillSpace | null = null;
  let best = 0;
  for (const space of SPACE_PRIORITY) {
    const count = counts.get(space) ?? 0;
    if (count > best) {
      best = count;
      mainSpace = space;
    }
  }

  const pods = recent.filter(
    (kill) => kill.victimShipTypeId !== null && POD_TYPE_IDS.has(kill.victimShipTypeId)
  ).length;

  return {
    level,
    recentKills: recent.length,
    lastKillMs,
    mainSpace,
    podShare: recent.length === 0 ? null : pods / recent.length,
    dangerKnown: dangerRatio !== null,
  };
}
