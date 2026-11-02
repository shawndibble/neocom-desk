/**
 * The Threat level read against where you are and who is in Local with you.
 * Pure. `threatVerdict` says how deadly a pilot has been anywhere; this says
 * how much of that is likely to reach you right now, and moves the level at
 * most one step for it. A wrong "low" costs more than a wrong "high", so:
 *
 * - it needs a real record (`CONTEXT_MIN_KILLS` kills that say what the rule needs);
 * - it only moves a pilot who already has a level from kills (Quiet stays Quiet);
 * - it never lowers below Low, and never raises above Active;
 * - what it did is returned, so the view can say so.
 */
import { sum } from '../math';
import type { KillRecord, KillSpace } from './killActivity';
import { recentKillsOf, type ThreatLevel } from './threatVerdict';

/** Kills that say where (or how many fought) before a rule may move the level. */
export const CONTEXT_MIN_KILLS = 5;
/** A killmail with this many attackers or more is a group kill. */
export const GANG_MIN_ATTACKERS = 4;
/** The share of a pilot's counted kills that are group kills to call them a group killer. */
export const GANG_STYLE_SHARE = 0.7;
/** Others from their corporation or alliance in Local that make a group killer's group "here". */
export const ORG_MATES_MIN = 3;

export type ContextReason = 'elsewhere' | 'gangAlone' | 'gangHere';

export interface ThreatContext {
  /** The kind of space you are in; null until it is known. */
  hereSpace: KillSpace | null;
  /**
   * Other pilots from their alliance (or, without one, their corporation) in this
   * Local list. Null when no Local list is in view, e.g. a profile opened elsewhere.
   */
  orgMatesHere: number | null;
}

export interface ThreatRead {
  level: ThreatLevel;
  /** The level before context. */
  base: ThreatLevel;
  /** Which way context moved the level: -1 lower, 1 higher, 0 not at all. */
  shift: -1 | 0 | 1;
  /** What moved the level; empty when it did not move. */
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
  // Up stops at Active: Dangerous keeps its own strict evidence (the ratios).
  const level = net < 0 ? LADDER[Math.max(0, at - 1)] : net > 0 && base === 'low' ? 'active' : base;
  if (level === base) return unchanged;
  return {
    level,
    base,
    shift: net < 0 ? -1 : 1,
    reasons: moves.filter((move) => Math.sign(move.step) === Math.sign(net)).map((m) => m.reason),
  };
}
