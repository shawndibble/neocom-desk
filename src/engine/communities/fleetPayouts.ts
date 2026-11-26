import { namesOf } from '../pilotList/nameLines';

export const MAX_FLEET_SHARES = 250;
export const MAX_PAYOUT_NAME_LENGTH = 60;
export const MAX_PILOT_NAME_LENGTH = 40;
export const MAX_OPEN_PAYOUTS_PER_MEMBER = 20;
export const MAX_HOLD_BACK_PCT = 50;
export const DEFAULT_HOLD_BACK_PCT = 10;
export const MAX_SHARE_WEIGHT = 1000;
export const MAX_PAYOUT_ISK = 1_000_000_000_000_000;
export const FLEET_PAYOUT_LIFETIME_DAYS = 30;

export type SplitRule = 'equal' | 'weighted';

export interface FleetPayout {
  id: string;
  ownerUid: string;
  ownerName: string;
  name: string;
  totalIsk: number;
  holdBackPct: number;
  rule: SplitRule;
  memberUids: string[];
  shareCount: number;
  paidCount: number;
  createdAt: number;
  expiresAt: number;
}

export interface FleetShare {
  id: string;
  pilotName: string;
  characterId: number | null;
  memberUid: string | null;
  weight: number;
  isk: number;
  paid: boolean;
  paidAt: number;
}

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

export function holdBackIsk(totalIsk: number, holdBackPct: number): number {
  return totalIsk - netIsk(totalIsk, holdBackPct);
}

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

export function mySharesOf(payouts: FleetPayout[], uid: string): FleetPayout[] {
  return payouts.filter((payout) => payout.memberUids.includes(uid));
}

export function isExpired(payout: FleetPayout, now: number): boolean {
  return payout.expiresAt <= now;
}
