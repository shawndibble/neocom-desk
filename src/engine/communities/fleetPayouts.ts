/**
 * Fleet Payouts (issue #4779): the pure rules of one loot split. A Fleet
 * Payout is opened by a Member (the fleet boss) from a pasted fleet list and a
 * priced loot pile; each pilot on the list gets one Fleet Share, a whole-ISK
 * amount and a paid flag only the boss sets. No Firestore, fetch or DOM here.
 */
import { namesOf } from '../pilotList/nameLines';

/** Mirrors `functions/src/communityFleetPayouts.ts`, which enforces them. */
export const MAX_FLEET_SHARES = 250;
export const MAX_PAYOUT_NAME_LENGTH = 60;
export const MAX_PILOT_NAME_LENGTH = 40;
export const MAX_OPEN_PAYOUTS_PER_MEMBER = 20;
export const MAX_HOLD_BACK_PCT = 50;
export const DEFAULT_HOLD_BACK_PCT = 10;
export const MAX_SHARE_WEIGHT = 1000;
/** Far above any real pile. */
export const MAX_PAYOUT_ISK = 1_000_000_000_000_000;
export const FLEET_PAYOUT_LIFETIME_DAYS = 30;

export type SplitRule = 'equal' | 'weighted';

export interface FleetPayout {
  id: string;
  ownerUid: string;
  ownerName: string;
  name: string;
  /** Whole ISK the pile is worth before the hold-back. */
  totalIsk: number;
  holdBackPct: number;
  rule: SplitRule;
  /** uids of the Members on the list; the boss's Payouts list reads this to find "mine". */
  memberUids: string[];
  shareCount: number;
  paidCount: number;
  createdAt: number;
  expiresAt: number;
}

export interface FleetShare {
  /** Document id: the line's index in the list, as a string. */
  id: string;
  pilotName: string;
  /** Null for a typed name ESI did not resolve. */
  characterId: number | null;
  /** The Member's uid when the pilot is in the Community, else null. */
  memberUid: string | null;
  weight: number;
  isk: number;
  paid: boolean;
  paidAt: number;
}

/** One line of a draft, before the server assigns ids and links Members. */
export interface FleetShareDraft {
  pilotName: string;
  characterId: number | null;
  weight: number;
  isk: number;
}

export interface FleetPayoutDraft {
  name: string;
  totalIsk: number;
  holdBackPct: number;
  rule: SplitRule;
  shares: FleetShareDraft[];
}

/** Pasted fleet list (EVE's fleet copy is a name per line): trimmed, blanks dropped, duplicates (any case) dropped keeping the first spelling. Uncapped: the caller checks MAX_FLEET_SHARES. */
export function fleetNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of namesOf(text)) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function netIsk(totalIsk: number, holdBackPct: number): number {
  return Math.floor((totalIsk * (100 - holdBackPct)) / 100);
}

/** ISK the boss keeps back: total less the net split. */
export function holdBackIsk(totalIsk: number, holdBackPct: number): number {
  return totalIsk - netIsk(totalIsk, holdBackPct);
}

/** Whole ISK per pilot, in `weights` order. Each is floored, so the few leftover ISK stay unallocated (sum never exceeds the net). */
export function splitIsk(
  totalIsk: number,
  holdBackPct: number,
  rule: SplitRule,
  weights: number[]
): number[] {
  if (weights.length === 0) return [];
  const net = netIsk(totalIsk, holdBackPct);
  if (rule === 'equal') {
    const each = Math.floor(net / weights.length);
    return weights.map(() => each);
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  return weights.map((w) => Math.floor((net * w) / sum));
}

export function fleetPayoutProgress(payout: FleetPayout): {
  paid: number;
  total: number;
  done: boolean;
} {
  const { paidCount: paid, shareCount: total } = payout;
  return { paid, total, done: total > 0 && paid >= total };
}

/** Payouts where this Member is on the list. */
export function mySharesOf(payouts: FleetPayout[], uid: string): FleetPayout[] {
  return payouts.filter((payout) => payout.memberUids.includes(uid));
}

export function isExpired(payout: FleetPayout, now: number): boolean {
  return payout.expiresAt <= now;
}
