import { sum } from '../math';
import type { KillRecord, KillSpace } from './killActivity';
import { DAY_MS } from '@/lib/age';

export type ThreatLevel = 'dangerous' | 'active' | 'low' | 'inactive';

export const THREAT_WINDOW_DAYS = 90;
export const ACTIVE_MIN_KILLS = 3;
export const DANGEROUS_MIN_KILLS = 10;
export const DANGEROUS_MIN_DANGER_RATIO = 50;
export const DANGEROUS_MIN_KILLER_RATIO = 60;

const POD_TYPE_IDS: ReadonlySet<number> = new Set([670, 33328]);
const ALSO_SPACE_MIN_SHARE = 0.2;
const SPACE_PRIORITY: readonly KillSpace[] = ['nullsec', 'wormhole', 'lowsec', 'highsec'];

export interface ThreatVerdict {
  level: ThreatLevel;
  recentKills: number;
  lastKillMs: number | null;
  mainSpace: KillSpace | null;
  alsoSpaces: KillSpace[];
  podShare: number | null;
  recentLosses: number;
  lastLossMs: number | null;
  ratiosKnown: boolean;
}

export function recentKillsOf(kills: readonly KillRecord[], nowMs: number): KillRecord[] {
  const since = nowMs - THREAT_WINDOW_DAYS * DAY_MS;
  return kills.filter((kill) => kill.timeMs >= since);
}

export function needsDangerRatio(kills: readonly KillRecord[], nowMs: number): boolean {
  return recentKillsOf(kills, nowMs).length >= DANGEROUS_MIN_KILLS;
}

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
  dangerRatio: number | null;
  killerRatio?: number | null;
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

  const placed = sum([...counts.values()]);
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
