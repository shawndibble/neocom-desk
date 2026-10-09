/**
 * The **Threat** verdict: how much a pilot's recent kills say they are worth
 * worrying about. Pure; the kill list, the ratios and the loss dates are
 * fetched in `src/lib/zkillboard.ts`. Kills decide the level. A recent loss
 * only keeps a pilot who has no recent kill from reading "inactive", since
 * losing a ship means they are flying. It is a read of how active and how
 * deadly they have been, never a statement that anyone is safe: the lowest
 * level is "low", not "safe".
 */
import type { KillRecord, KillSpace } from './killActivity';

export type ThreatLevel = 'dangerous' | 'active' | 'low' | 'inactive';

/** How far back the verdict looks. Kills older than this count for nothing. */
export const THREAT_WINDOW_DAYS = 90;
/** Recent kills it takes to be "active". */
export const ACTIVE_MIN_KILLS = 3;
/** Recent kills it takes to be "dangerous", together with `DANGEROUS_MIN_DANGER_RATIO`. */
export const DANGEROUS_MIN_KILLS = 10;
/** zKillboard's all-time danger ratio (0-100) that makes a pilot "dangerous", given the kills. */
export const DANGEROUS_MIN_DANGER_RATIO = 50;
/**
 * The share of their record that is kills, by ship count (0-100), that also
 * makes a pilot "dangerous". The danger ratio weights ships by size, so a
 * heavy killer of small ships can sit below 50 on it.
 */
export const DANGEROUS_MIN_KILLER_RATIO = 60;

const DAY_MS = 86_400_000;
/** Capsule and its Genolution variant: the two pod hulls. */
const POD_TYPE_IDS: ReadonlySet<number> = new Set([670, 33328]);
/** A space other than the main one is worth a mention from this share of the recent kills that say where. */
const ALSO_SPACE_MIN_SHARE = 0.2;
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
  /** Other kinds of space with a fifth or more of the recent kills that say where, worst first. */
  alsoSpaces: KillSpace[];
  /** Capsules as a 0-1 share of recent kills; null when there are none. */
  podShare: number | null;
  /** Losses inside the 90-day window; 0 when the losses were not looked up. */
  recentLosses: number;
  /** The newest loss, any age; null when none was given. */
  lastLossMs: number | null;
  /** False when neither ratio was given, so "dangerous" was out of reach. */
  ratiosKnown: boolean;
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

/**
 * Whether the loss dates can change this pilot's level: only a pilot with no
 * kill in the window can be "inactive", so every other pilot needs no losses.
 */
export function needsLossHistory(kills: readonly KillRecord[], nowMs: number): boolean {
  return recentKillsOf(kills, nowMs).length === 0;
}

export function threatVerdict({
  kills,
  dangerRatio,
  killerRatio = null,
  lossTimesMs = null,
  nowMs,
}: {
  kills: readonly KillRecord[];
  /** zKillboard's all-time danger ratio, 0-100; null when unknown. */
  dangerRatio: number | null;
  /** Kills as a 0-100 share of kills and losses, by ship count; null when unknown. */
  killerRatio?: number | null;
  /** When the pilot's newest losses happened; null when they were not looked up. */
  lossTimesMs?: readonly number[] | null;
  nowMs: number;
}): ThreatVerdict {
  const recent = recentKillsOf(kills, nowMs);
  const since = nowMs - THREAT_WINDOW_DAYS * DAY_MS;
  const losses = lossTimesMs ?? [];
  const recentLosses = losses.filter((time) => time >= since).length;
  let lastLossMs: number | null = null;
  for (const time of losses) if (lastLossMs === null || time > lastLossMs) lastLossMs = time;

  const lethal =
    (dangerRatio !== null && dangerRatio >= DANGEROUS_MIN_DANGER_RATIO) ||
    (killerRatio !== null && killerRatio >= DANGEROUS_MIN_KILLER_RATIO);
  let level: ThreatLevel;
  if (recent.length === 0) level = recentLosses > 0 ? 'low' : 'inactive';
  else if (recent.length >= DANGEROUS_MIN_KILLS && lethal) level = 'dangerous';
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

  const placed = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const alsoSpaces = SPACE_PRIORITY.filter(
    (space) =>
      space !== mainSpace && placed > 0 && (counts.get(space) ?? 0) / placed >= ALSO_SPACE_MIN_SHARE
  );

  const pods = recent.filter(
    (kill) => kill.victimShipTypeId !== null && POD_TYPE_IDS.has(kill.victimShipTypeId)
  ).length;

  return {
    level,
    recentKills: recent.length,
    lastKillMs,
    mainSpace,
    alsoSpaces,
    podShare: recent.length === 0 ? null : pods / recent.length,
    recentLosses,
    lastLossMs,
    ratiosKnown: dangerRatio !== null || killerRatio !== null,
  };
}
