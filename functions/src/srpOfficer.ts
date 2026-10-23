// SRP officer decisions (issue #4853, epic #4608, ADR 0026): the pure half. Input parsing and the
// state-transition rules for approve, reject, change amount and mark paid, with no Firestore. The
// transaction that applies a decision is in srpOfficerStore.ts.
//
// State machine (anything else is refused): pending -> approved | rejected, approved -> paid.
// An amount may also be changed while a claim is pending or approved (never once paid or rejected).
// An officer never decides their own claim: another officer must.
// `closedAt` is set when a claim becomes paid or rejected (the retention sweep, #4856, keys on it).
// The app never moves ISK: an officer pays in game, then marks the claim paid.

import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import { int } from './corpTaxBook.js';
import { fail } from './corpTaxBookStore.js';

/** The most claims one batch call touches. */
export const MAX_SRP_BATCH = 50;
export const MAX_SRP_AMOUNT = 1e13;
export const MAX_SRP_REASON = 500;

const KILLMAIL_ID_MAX = 2_147_483_647;
const killmailId = (value: unknown) => int(value, 'killmailId', 1, KILLMAIL_ID_MAX);
const amountField = (value: unknown) => int(value, 'amount', 1, MAX_SRP_AMOUNT);
const reasonField = (value: unknown) => boundedString(value, 'reason', MAX_SRP_REASON);

/**
 * The amount the officer saw, whole ISK, or null when the claim showed none. Omitted means no
 * check. A claim whose stored amount differs is refused (`amount-changed`).
 */
function expectedAmountField(value: unknown): number | null {
  return value === null ? null : amountField(value);
}

export interface ApproveItem {
  killmailId: number;
  /** An officer-typed or overriding amount, whole ISK. */
  amount?: number;
  reason?: string;
  expectedAmount?: number | null;
}

export function parseApproveItem(data: unknown): ApproveItem {
  const d = record(data);
  const item: ApproveItem = { killmailId: killmailId(d.killmailId) };
  if (d.amount !== undefined) item.amount = amountField(d.amount);
  if (d.reason !== undefined && d.reason !== null && d.reason !== '') {
    item.reason = reasonField(d.reason);
  }
  if (d.expectedAmount !== undefined) item.expectedAmount = expectedAmountField(d.expectedAmount);
  return item;
}

function list(raw: unknown, field: string): unknown[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SRP_BATCH) {
    throw new HttpsError('invalid-argument', `${field} must list 1-${MAX_SRP_BATCH} claims`);
  }
  return raw;
}

function distinct<T extends { killmailId: number }>(items: T[]): T[] {
  if (new Set(items.map((i) => i.killmailId)).size !== items.length) {
    throw new HttpsError('invalid-argument', 'a claim is listed twice');
  }
  return items;
}

export function parseApproveBatch(data: unknown): ApproveItem[] {
  return distinct(list(record(data).claims, 'claims').map(parseApproveItem));
}

export interface MarkPaidItem {
  killmailId: number;
  expectedAmount?: number | null;
}

export function parseMarkPaidItem(data: unknown): MarkPaidItem {
  const d = record(data);
  const item: MarkPaidItem = { killmailId: killmailId(d.killmailId) };
  if (d.expectedAmount !== undefined) item.expectedAmount = expectedAmountField(d.expectedAmount);
  return item;
}

/** `claims: [{ killmailId, expectedAmount? }]`; the older `killmailIds: number[]` still works. */
export function parseMarkPaidBatch(data: unknown): MarkPaidItem[] {
  const d = record(data);
  if (d.claims === undefined && d.killmailIds !== undefined) {
    return distinct(
      list(d.killmailIds, 'killmailIds').map((id) => ({ killmailId: killmailId(id) }))
    );
  }
  return distinct(list(d.claims, 'claims').map(parseMarkPaidItem));
}

export interface RejectItem {
  killmailId: number;
  reason: string;
}

export function parseReject(data: unknown): RejectItem {
  const d = record(data);
  return { killmailId: killmailId(d.killmailId), reason: reasonField(d.reason) };
}

export interface ChangeAmountItem {
  killmailId: number;
  amount: number;
  reason: string;
}

export function parseChangeAmount(data: unknown): ChangeAmountItem {
  const d = record(data);
  return {
    killmailId: killmailId(d.killmailId),
    amount: amountField(d.amount),
    reason: reasonField(d.reason),
  };
}

// --- Decisions ---------------------------------------------------------------

export interface Officer {
  characterId: number;
  characterName: string;
}

/** What the result mail (#4854) needs, plus the new state. */
export interface SrpClaimOutcome {
  killmailId: number;
  state: 'pending' | 'approved' | 'paid' | 'rejected';
  /** The pilot the claim belongs to. */
  characterId: number | null;
  characterName: string | null;
  amount: number | null;
  reason?: string;
}

export interface Decision {
  /** Fields to merge into the claim doc. */
  patch: Record<string, unknown>;
  /** The audit entry's `detail`. */
  detail: Record<string, unknown>;
  outcome: SrpClaimOutcome;
}

type ClaimData = Record<string, unknown> | undefined;

const amountOf = (claim: Record<string, unknown>): number | null =>
  typeof claim.amount === 'number' ? claim.amount : null;

function outcomeOf(
  claim: Record<string, unknown>,
  id: number,
  state: SrpClaimOutcome['state'],
  amount: number | null,
  reason?: string
): SrpClaimOutcome {
  return {
    killmailId: id,
    state,
    characterId: typeof claim.characterId === 'number' ? claim.characterId : null,
    characterName: typeof claim.characterName === 'string' ? claim.characterName : null,
    amount,
    ...(reason === undefined ? {} : { reason }),
  };
}

/** The claim, once it exists, is in one of `from`, and is not the deciding officer's own. */
function requireState(
  claim: ClaimData,
  from: SrpClaimOutcome['state'] | SrpClaimOutcome['state'][],
  officer: Officer
): Record<string, unknown> {
  if (!claim) fail('not-found', 'No such SRP claim', 'claim-not-found');
  if (claim.characterId === officer.characterId) {
    fail('permission-denied', 'Another officer must decide your own claim', 'own-claim');
  }
  const allowed = Array.isArray(from) ? from : [from];
  if (!allowed.includes(claim.state as SrpClaimOutcome['state'])) {
    fail(
      'failed-precondition',
      `That claim is ${String(claim.state)}, not ${allowed.join(' or ')}`,
      'illegal-transition'
    );
  }
  return claim;
}

/** Refuses a decision on an amount the officer did not see. */
function requireExpectedAmount(
  claim: Record<string, unknown>,
  expected: number | null | undefined
): void {
  if (expected !== undefined && expected !== amountOf(claim)) {
    fail('failed-precondition', 'The amount changed: review the claim again', 'amount-changed');
  }
}

/** The fields that record an amount an officer set, keeping what the server worked out. */
function overrideFields(
  claim: Record<string, unknown>,
  officer: Officer,
  now: number,
  amount: number,
  reason: string | undefined
): Record<string, unknown> {
  const computed = amountOf(claim);
  return {
    amount,
    // The first computed figure stays visible through later changes.
    computedAmount: claim.computedAmount ?? computed,
    amountSource: computed === null && claim.computedAmount === undefined ? 'typed' : 'override',
    ...(reason === undefined ? {} : { overrideReason: reason }),
    overrideBy: officer.characterId,
    overrideByName: officer.characterName,
    overrideAt: now,
  };
}

/** Pending -> approved. An amount that differs from the worked-out one needs a reason; none known needs a typed one. */
export function decideApprove(
  claimData: ClaimData,
  item: ApproveItem,
  officer: Officer,
  now: number
): Decision {
  const claim = requireState(claimData, 'pending', officer);
  requireExpectedAmount(claim, item.expectedAmount);
  const held = amountOf(claim);
  let amount = held;
  let override: Record<string, unknown> = {};
  if (item.amount !== undefined && item.amount !== held) {
    if (held !== null && item.reason === undefined) {
      fail('invalid-argument', 'Changing the amount needs a reason', 'reason-required');
    }
    amount = item.amount;
    override = overrideFields(claim, officer, now, item.amount, item.reason);
  }
  if (amount === null) {
    fail('failed-precondition', 'No amount worked out: type one to approve', 'amount-required');
  }
  return {
    patch: {
      ...override,
      state: 'approved',
      amount,
      decidedAt: now,
      decidedBy: officer.characterId,
      decidedByName: officer.characterName,
    },
    detail: {
      killmailId: item.killmailId,
      pilotCharacterId: claim.characterId ?? null,
      amount,
      ...(Object.keys(override).length > 0
        ? { computedAmount: held, reason: item.reason ?? null }
        : {}),
    },
    outcome: outcomeOf(claim, item.killmailId, 'approved', amount, item.reason),
  };
}

/** Pending -> rejected, with the reason the pilot is told. */
export function decideReject(
  claimData: ClaimData,
  item: RejectItem,
  officer: Officer,
  now: number
): Decision {
  const claim = requireState(claimData, 'pending', officer);
  return {
    patch: {
      state: 'rejected',
      rejectionReason: item.reason,
      decidedAt: now,
      decidedBy: officer.characterId,
      decidedByName: officer.characterName,
      closedAt: now,
    },
    detail: {
      killmailId: item.killmailId,
      pilotCharacterId: claim.characterId ?? null,
      amount: amountOf(claim),
      reason: item.reason,
    },
    outcome: outcomeOf(claim, item.killmailId, 'rejected', amountOf(claim), item.reason),
  };
}

/** A pending or approved claim keeps its state (and has no closedAt); its amount changes, with a reason. */
export function decideChangeAmount(
  claimData: ClaimData,
  item: ChangeAmountItem,
  officer: Officer,
  now: number
): Decision {
  const claim = requireState(claimData, ['pending', 'approved'], officer);
  const held = amountOf(claim);
  if (item.amount === held)
    fail('invalid-argument', 'That is already the amount', 'amount-unchanged');
  return {
    patch: overrideFields(claim, officer, now, item.amount, item.reason),
    detail: {
      killmailId: item.killmailId,
      pilotCharacterId: claim.characterId ?? null,
      from: held,
      amount: item.amount,
      reason: item.reason,
    },
    outcome: outcomeOf(
      claim,
      item.killmailId,
      claim.state as SrpClaimOutcome['state'],
      item.amount,
      item.reason
    ),
  };
}

/** Approved -> paid: the officer paid in game; the app records it. */
export function decideMarkPaid(
  claimData: ClaimData,
  item: MarkPaidItem,
  officer: Officer,
  now: number
): Decision {
  const id = item.killmailId;
  const claim = requireState(claimData, 'approved', officer);
  requireExpectedAmount(claim, item.expectedAmount);
  const amount = amountOf(claim);
  return {
    patch: {
      state: 'paid',
      paidAt: now,
      paidBy: officer.characterId,
      paidByName: officer.characterName,
      closedAt: now,
    },
    detail: { killmailId: id, pilotCharacterId: claim.characterId ?? null, amount },
    outcome: outcomeOf(claim, id, 'paid', amount),
  };
}
