import { DAY_MS } from '@/lib/age';
import { callableErrorReason } from '@/lib/callableError';
import type { DoctrinePreview, HullRule, SrpClaimBasis, SrpClaimState } from '../srpTypes';

export interface MemberClaim {
  killmailId: number;
  killmailHash: string;
  hullTypeId: number;
  classId: number;
  solarSystemId: number;
  killedAt: number;
  filedAt: number;
  state: SrpClaimState;
  amount: number | null;
  basis?: SrpClaimBasis | null;
  rejectionReason: string | null;
  refileCount: number;
  fleetOrFc?: string | null;
  note?: string | null;
}

export interface LostLoss {
  killmailId: number;
  killmailHash: string;
  hullTypeId: number;
  classId: number;
  solarSystemId: number;
  killedAt: number;
}

export type LostRowKind = 'open' | 'claimed' | 'old' | 'notCovered';

export interface LostRowContext {
  claims: readonly MemberClaim[];
  hullRules: readonly HullRule[];
  windowDays: number;
  now: number;
}

function isHullNotCovered(
  rules: readonly HullRule[],
  hullTypeId: number,
  classId: number
): boolean {
  const rule =
    rules.find((r) => r.scope === 'hull' && r.id === hullTypeId) ??
    rules.find((r) => r.scope === 'class' && r.id === classId);
  return rule?.kind === 'not-covered';
}

export function lostRowKind(loss: LostLoss, ctx: LostRowContext): LostRowKind {
  if (ctx.claims.some((c) => c.killmailId === loss.killmailId)) return 'claimed';
  if (ctx.now - loss.killedAt > ctx.windowDays * DAY_MS) return 'old';
  if (isHullNotCovered(ctx.hullRules, loss.hullTypeId, loss.classId)) return 'notCovered';
  return 'open';
}

export function canRefile(claim: Pick<MemberClaim, 'state' | 'refileCount'>): boolean {
  return claim.state === 'rejected' && claim.refileCount < 1;
}

const OPEN_FIRST: Record<SrpClaimState, number> = { pending: 0, approved: 0, paid: 1, rejected: 1 };

export function orderClaims(claims: readonly MemberClaim[]): MemberClaim[] {
  return [...claims].sort(
    (a, b) => OPEN_FIRST[a.state] - OPEN_FIRST[b.state] || b.filedAt - a.filedAt
  );
}

export function esiKillmailLink(killmailId: number, hash: string): string {
  return `https://esi.evetech.net/latest/killmails/${killmailId}/${hash}/`;
}

const KILLMAIL_LINK = /(?:zkillboard\.com\/kill\/\d+|\/killmails\/\d+\/[0-9a-f]{40})/i;

export const looksLikeKillmailLink = (text: string): boolean => KILLMAIL_LINK.test(text.trim());

export const hullIsDoctrineChecked = (rules: readonly HullRule[], hullTypeId: number): boolean =>
  rules.some((r) => r.scope === 'hull' && r.id === hullTypeId && (r.doctrineIds?.length ?? 0) > 0);

export type MemberErrorTarget = 'link' | 'fleet' | 'notCovered' | 'form';

const REASONS: Record<string, { key: string; target: MemberErrorTarget }> = {
  'srp-off': { key: 'srpMember.errors.srpOff', target: 'form' },
  'not-your-loss': { key: 'srpMember.errors.notYourLoss', target: 'link' },
  'loss-in-other-corp': { key: 'srpMember.errors.lossInOtherCorp', target: 'link' },
  'outside-window': { key: 'srpMember.errors.outsideWindow', target: 'link' },
  'already-claimed': { key: 'srpMember.errors.alreadyClaimed', target: 'link' },
  'not-covered': { key: 'srpMember.errors.notCovered', target: 'notCovered' },
  'fleet-or-fc-required': { key: 'srpMember.errors.fleetOrFcRequired', target: 'fleet' },
  'note-required': { key: 'srpMember.errors.noteRequired', target: 'form' },
  'hash-unavailable': { key: 'srpMember.errors.hashUnavailable', target: 'link' },
  'killmail-not-found': { key: 'srpMember.errors.killmailNotFound', target: 'link' },
  'wrong-corp': { key: 'srpMember.errors.wrongCorp', target: 'form' },
  'bad-killmail-link': { key: 'srpMember.errors.badKillmailLink', target: 'link' },
};

export const GENERIC_ERROR_KEY = 'srpMember.errors.generic';

export function memberErrorKey(error: unknown): string {
  const reason = callableErrorReason(error);
  return (reason !== null ? REASONS[reason]?.key : undefined) ?? GENERIC_ERROR_KEY;
}

export function memberErrorTarget(error: unknown): MemberErrorTarget {
  const reason = callableErrorReason(error);
  return (reason !== null ? REASONS[reason]?.target : undefined) ?? 'form';
}

export function isUsablePreview(preview: unknown): preview is DoctrinePreview {
  if (typeof preview !== 'object' || preview === null) return false;
  const { check, quote, values } = preview as Partial<DoctrinePreview>;
  return (
    typeof check === 'object' &&
    check !== null &&
    typeof quote === 'object' &&
    quote !== null &&
    typeof quote.kind === 'string' &&
    typeof values === 'object' &&
    values !== null
  );
}
