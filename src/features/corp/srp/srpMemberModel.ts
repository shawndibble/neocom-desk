/**
 * The pure half of the SRP member page (issue #4852, epic #4608): which row a lost ship is, who
 * may re-file, how claims are ordered, and which message a refusal reads as. No fetch, no React.
 * The server prices and decides; this only mirrors enough of its rules to label rows the same way.
 */
import { callableErrorReason } from '@/lib/callableError';
import type { HullRule, SrpClaimBasis, SrpClaimState } from '../srpTypes';

/** A claim as the pilot reads it: the fields of `corps/{id}/srpClaims/{killmailId}` the page shows. */
export interface MemberClaim {
  killmailId: number;
  killmailHash: string;
  hullTypeId: number;
  classId: number;
  solarSystemId: number;
  /** Epoch ms. */
  killedAt: number;
  filedAt: number;
  state: SrpClaimState;
  /** Whole ISK; null while an officer has yet to type it. */
  amount: number | null;
  basis?: SrpClaimBasis | null;
  rejectionReason: string | null;
  /** 0 until the one re-file is used. */
  refileCount: number;
  fleetOrFc?: string | null;
  note?: string | null;
}

/** One of the pilot's own losses, from their killmails. */
export interface LostLoss {
  killmailId: number;
  killmailHash: string;
  hullTypeId: number;
  classId: number;
  solarSystemId: number;
  /** Epoch ms. */
  killedAt: number;
}

export type LostRowKind = 'open' | 'claimed' | 'old' | 'notCovered';

export interface LostRowContext {
  claims: readonly MemberClaim[];
  hullRules: readonly HullRule[];
  windowDays: number;
  now: number;
}

const DAY_MS = 86_400_000;

/** The hull's own rule beats its class's, as the server's pricing does. */
export function isHullNotCovered(
  rules: readonly HullRule[],
  hullTypeId: number,
  classId: number
): boolean {
  const rule =
    rules.find((r) => r.scope === 'hull' && r.id === hullTypeId) ??
    rules.find((r) => r.scope === 'class' && r.id === classId);
  return rule?.kind === 'not-covered';
}

/** Claimed (even a Rejected one: re-filing lives in My claims) beats Too old beats Not covered. */
export function lostRowKind(loss: LostLoss, ctx: LostRowContext): LostRowKind {
  if (ctx.claims.some((c) => c.killmailId === loss.killmailId)) return 'claimed';
  if (ctx.now - loss.killedAt > ctx.windowDays * DAY_MS) return 'old';
  if (isHullNotCovered(ctx.hullRules, loss.hullTypeId, loss.classId)) return 'notCovered';
  return 'open';
}

/** A Rejected claim may be re-filed once. */
export function canRefile(claim: Pick<MemberClaim, 'state' | 'refileCount'>): boolean {
  return claim.state === 'rejected' && claim.refileCount < 1;
}

const OPEN_FIRST: Record<SrpClaimState, number> = { pending: 0, approved: 0, paid: 1, rejected: 1 };

/** Claims waiting on an officer or on payment first, then closed ones; newest filed first in each. */
export function orderClaims(claims: readonly MemberClaim[]): MemberClaim[] {
  return [...claims].sort(
    (a, b) => OPEN_FIRST[a.state] - OPEN_FIRST[b.state] || b.filedAt - a.filedAt
  );
}

/** The link the file-claim callable reads for a killmail whose hash is known. */
export function esiKillmailLink(killmailId: number, hash: string): string {
  return `https://esi.evetech.net/latest/killmails/${killmailId}/${hash}/`;
}

/**
 * Each `details.reason` the callables send, as a literal i18n key (literal so the locale
 * split and the unused-key check can see them).
 */
export const MEMBER_ERROR_KEYS: Record<string, string> = {
  'srp-off': 'srpMember.errors.srpOff',
  'not-your-loss': 'srpMember.errors.notYourLoss',
  'loss-in-other-corp': 'srpMember.errors.lossInOtherCorp',
  'outside-window': 'srpMember.errors.outsideWindow',
  'already-claimed': 'srpMember.errors.alreadyClaimed',
  'not-covered': 'srpMember.errors.notCovered',
  'fleet-or-fc-required': 'srpMember.errors.fleetOrFcRequired',
  'note-required': 'srpMember.errors.noteRequired',
  'hash-unavailable': 'srpMember.errors.hashUnavailable',
  'killmail-not-found': 'srpMember.errors.killmailNotFound',
  'wrong-corp': 'srpMember.errors.wrongCorp',
  'bad-killmail-link': 'srpMember.errors.badKillmailLink',
  generic: 'srpMember.errors.generic',
};

/** The i18n key for a refusal; an unknown reason, or none (offline), reads as the generic one. */
export function memberErrorKey(error: unknown): string {
  const reason = callableErrorReason(error);
  return (reason !== null ? MEMBER_ERROR_KEYS[reason] : undefined) ?? MEMBER_ERROR_KEYS.generic!;
}

export type MemberErrorTarget = 'link' | 'fleet' | 'note' | 'notCovered' | 'form';

const ERROR_TARGETS: Record<string, MemberErrorTarget> = {
  'bad-killmail-link': 'link',
  'not-your-loss': 'link',
  'loss-in-other-corp': 'link',
  'outside-window': 'link',
  'already-claimed': 'link',
  'hash-unavailable': 'link',
  'killmail-not-found': 'link',
  'fleet-or-fc-required': 'fleet',
  'note-required': 'note',
  'not-covered': 'notCovered',
};

/** Where a refusal shows: beside the field that can fix it, else on the form. */
export function memberErrorTarget(error: unknown): MemberErrorTarget {
  const reason = callableErrorReason(error);
  return (reason !== null ? ERROR_TARGETS[reason] : undefined) ?? 'form';
}
