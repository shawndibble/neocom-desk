import { fail } from './actorAuth.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import { int } from './corpTaxBook.js';
import type { SrpClaimState } from './srpTypes.js';

export const MAX_SRP_BATCH = 50;
export const MAX_SRP_AMOUNT = 1e13;
export const MAX_SRP_REASON = 500;

const KILLMAIL_ID_MAX = 2_147_483_647;
const killmailId = (value: unknown) => int(value, 'killmailId', 1, KILLMAIL_ID_MAX);
const amountField = (value: unknown) => int(value, 'amount', 1, MAX_SRP_AMOUNT);
const reasonField = (value: unknown) => boundedString(value, 'reason', MAX_SRP_REASON);

function expectedAmountField(value: unknown): number | null {
  return value === null ? null : amountField(value);
}

export interface ApproveItem {
  killmailId: number;
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

export function parseMarkPaidBatch(data: unknown): MarkPaidItem[] {
  const d = record(data);
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

export interface Officer {
  characterId: number;
  characterName: string;
}

export interface SrpClaimOutcome {
  killmailId: number;
  state: SrpClaimState;
  characterId: number | null;
  characterName: string | null;
  amount: number | null;
  reason?: string;
}

export interface Decision {
  patch: Record<string, unknown>;
  detail: Record<string, unknown>;
  outcome: SrpClaimOutcome;
}

type ClaimData = Record<string, unknown> | undefined;

const amountOf = (claim: Record<string, unknown>): number | null =>
  typeof claim.amount === 'number' ? claim.amount : null;

function outcomeOf(
  claim: Record<string, unknown>,
  id: number,
  state: SrpClaimState,
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

function requireState(
  claim: ClaimData,
  from: SrpClaimState | SrpClaimState[],
  officer: Officer
): Record<string, unknown> {
  if (!claim) fail('not-found', 'No such SRP claim', 'claim-not-found');
  if (claim.characterId === officer.characterId) {
    fail('permission-denied', 'Another officer must decide your own claim', 'own-claim');
  }
  const allowed = Array.isArray(from) ? from : [from];
  if (!allowed.includes(claim.state as SrpClaimState)) {
    fail(
      'failed-precondition',
      `That claim is ${String(claim.state)}, not ${allowed.join(' or ')}`,
      'illegal-transition'
    );
  }
  return claim;
}

function requireExpectedAmount(
  claim: Record<string, unknown>,
  expected: number | null | undefined
): void {
  if (expected !== undefined && expected !== amountOf(claim)) {
    fail('failed-precondition', 'The amount changed: review the claim again', 'amount-changed');
  }
}

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
    computedAmount: claim.computedAmount ?? computed,
    amountSource: computed === null && claim.computedAmount === undefined ? 'typed' : 'override',
    ...(reason === undefined ? {} : { overrideReason: reason }),
    overrideBy: officer.characterId,
    overrideByName: officer.characterName,
    overrideAt: now,
  };
}

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
      claim.state as SrpClaimState,
      item.amount,
      item.reason
    ),
  };
}

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
