import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, docId, record } from './communities.js';
import { intIn } from './inputParse.js';

export const FLEET_PAYOUTS_COLLECTION = 'fleetPayouts';
export const FLEET_SHARES_COLLECTION = 'shares';

export const MAX_FLEET_SHARES = 250;
export const MAX_PAYOUT_NAME_LENGTH = 60;
export const MAX_PILOT_NAME_LENGTH = 40;
export const MAX_OPEN_PAYOUTS_PER_MEMBER = 20;
export const MAX_HOLD_BACK_PCT = 50;
export const MAX_SHARE_WEIGHT = 1000;
export const MAX_PAYOUT_ISK = 1_000_000_000_000_000;
export const FLEET_PAYOUT_LIFETIME_DAYS = 30;
export const FLEET_PAYOUT_LIFETIME_MS = FLEET_PAYOUT_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
export const FLEET_PAYOUT_EXPIRED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type SplitRule = 'equal' | 'weighted';

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

export interface CreateFleetPayoutInput extends FleetPayoutDraft {
  communityId: string;
}

export interface FleetPayoutIdInput {
  communityId: string;
  payoutId: string;
}

export interface SetFleetShareDoneInput extends FleetPayoutIdInput {
  shareId: string;
  paid: boolean;
}

function parseShare(raw: unknown, index: number): FleetShareDraft {
  const d = record(raw);
  const at = `share ${index}`;
  return {
    pilotName: boundedString(d.pilotName, `${at} pilotName`, MAX_PILOT_NAME_LENGTH),
    characterId:
      d.characterId === null || d.characterId === undefined
        ? null
        : intIn(d.characterId, `${at} characterId`, 1, Number.MAX_SAFE_INTEGER),
    weight: intIn(d.weight, `${at} weight`, 1, MAX_SHARE_WEIGHT),
    isk: intIn(d.isk, `${at} isk`, 0, MAX_PAYOUT_ISK),
  };
}

export function parseCreateFleetPayoutInput(data: unknown): CreateFleetPayoutInput {
  const d = record(data);
  if (d.rule !== 'equal' && d.rule !== 'weighted') {
    throw new HttpsError('invalid-argument', 'rule must be equal or weighted');
  }
  if (!Array.isArray(d.shares) || d.shares.length === 0) {
    throw new HttpsError('invalid-argument', 'a Fleet Payout needs at least one share');
  }
  if (d.shares.length > MAX_FLEET_SHARES) {
    throw new HttpsError(
      'resource-exhausted',
      `A Fleet Payout holds at most ${MAX_FLEET_SHARES} shares`,
      { reason: 'too-many-shares' }
    );
  }
  return {
    communityId: docId(d.communityId, 'communityId'),
    name: boundedString(d.name, 'name', MAX_PAYOUT_NAME_LENGTH),
    totalIsk: intIn(d.totalIsk, 'totalIsk', 0, MAX_PAYOUT_ISK),
    holdBackPct: intIn(d.holdBackPct, 'holdBackPct', 0, MAX_HOLD_BACK_PCT),
    rule: d.rule,
    shares: d.shares.map(parseShare),
  };
}

export function parseFleetPayoutIdInput(data: unknown): FleetPayoutIdInput {
  const d = record(data);
  return {
    communityId: docId(d.communityId, 'communityId'),
    payoutId: docId(d.payoutId, 'payoutId'),
  };
}

export function parseSetFleetShareDoneInput(data: unknown): SetFleetShareDoneInput {
  const d = record(data);
  if (typeof d.paid !== 'boolean') {
    throw new HttpsError('invalid-argument', 'paid must be true or false');
  }
  return { ...parseFleetPayoutIdInput(data), shareId: docId(d.shareId, 'shareId'), paid: d.paid };
}

export function distributableIsk(totalIsk: number, holdBackPct: number): number {
  return Math.floor((totalIsk * (100 - holdBackPct)) / 100);
}

export type CreateDecision =
  'ok' | 'shares-exceed-total' | 'duplicate-pilot' | 'too-many-open-payouts';

export function decideCreate(draft: FleetPayoutDraft, openCount: number): CreateDecision {
  const pilots = new Set<string>();
  let sum = 0;
  for (const share of draft.shares) {
    const key =
      share.characterId !== null ? `id:${share.characterId}` : `n:${share.pilotName.toLowerCase()}`;
    if (pilots.has(key)) return 'duplicate-pilot';
    pilots.add(key);
    sum += share.isk;
  }
  if (sum > distributableIsk(draft.totalIsk, draft.holdBackPct)) return 'shares-exceed-total';
  return openCount >= MAX_OPEN_PAYOUTS_PER_MEMBER ? 'too-many-open-payouts' : 'ok';
}

export function isOpenPayout(payout: { expiresAt: number }, now: number): boolean {
  return payout.expiresAt > now;
}

export type OwnerActionDecision = 'ok' | 'not-found' | 'not-owner';

export function decideOwnerAction(state: {
  exists: boolean;
  ownerUid: string | null;
  callerUid: string;
}): OwnerActionDecision {
  if (!state.exists) return 'not-found';
  return state.ownerUid === state.callerUid ? 'ok' : 'not-owner';
}

export type SweepDecision = 'keep' | 'delete';

export function decideFleetPayoutSweep(payout: { expiresAt: number }, now: number): SweepDecision {
  if (!Number.isFinite(payout.expiresAt)) return 'keep';
  return now - payout.expiresAt >= FLEET_PAYOUT_EXPIRED_RETENTION_MS ? 'delete' : 'keep';
}
