import { sum } from '../math';
import type { KillRecord, KillSpace } from './killActivity';
import { recentKillsOf, type ThreatLevel } from './threatVerdict';

export const CONTEXT_MIN_KILLS = 5;
export const GANG_MIN_ATTACKERS = 4;
export const GANG_STYLE_SHARE = 0.7;
export const ORG_MATES_MIN = 3;

export type ContextReason = 'elsewhere' | 'gangAlone' | 'gangHere';

export interface ThreatContext {
  hereSpace: KillSpace | null;
  orgMatesHere: number | null;
}

export interface ThreatRead {
  level: ThreatLevel;
  base: ThreatLevel;
  shift: -1 | 0 | 1;
  reasons: ContextReason[];
}

const LADDER: readonly ThreatLevel[] = ['low', 'active', 'dangerous'];

export function threatInContext(
  base: ThreatLevel,
  kills: readonly KillRecord[],
  nowMs: number,
  context: ThreatContext
): ThreatRead {
  const unchanged: ThreatRead = { level: base, base, shift: 0, reasons: [] };
  if (!LADDER.includes(base)) return unchanged;
  const recent = recentKillsOf(kills, nowMs);

  const moves: { reason: ContextReason; step: -1 | 1 }[] = [];

  const placed = recent.filter((kill) => kill.space !== null);
  if (
    context.hereSpace !== null &&
    placed.length >= CONTEXT_MIN_KILLS &&
    !placed.some((kill) => kill.space === context.hereSpace)
  ) {
    moves.push({ reason: 'elsewhere', step: -1 });
  }

  const counted = recent.filter((kill) => kill.attackerCount != null);
  const groupKills = counted.filter((kill) => (kill.attackerCount ?? 0) >= GANG_MIN_ATTACKERS);
  const groupKiller =
    counted.length >= CONTEXT_MIN_KILLS && groupKills.length / counted.length >= GANG_STYLE_SHARE;
  if (groupKiller && context.orgMatesHere !== null) {
    if (context.orgMatesHere >= ORG_MATES_MIN) moves.push({ reason: 'gangHere', step: 1 });
    else if (context.orgMatesHere === 0) moves.push({ reason: 'gangAlone', step: -1 });
  }

  const net = Math.max(-1, Math.min(1, sum(moves.map((move) => move.step))));
  const at = LADDER.indexOf(base);
  const level = net < 0 ? LADDER[Math.max(0, at - 1)] : net > 0 && base === 'low' ? 'active' : base;
  if (level === base) return unchanged;
  return {
    level,
    base,
    shift: net < 0 ? -1 : 1,
    reasons: moves.filter((move) => Math.sign(move.step) === Math.sign(net)).map((m) => m.reason),
  };
}
