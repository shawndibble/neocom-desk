import { callableErrorReason } from '@/lib/callableError';
import { chunk } from '@/lib/chunk';
import type { SrpBatchOutcome, SrpBatchResult, SrpClaim } from '../srpClaimTypes';

export type QueueTab = 'pending' | 'owed' | 'history';

export interface QueueSplit {
  pending: SrpClaim[];
  owed: SrpClaim[];
  history: SrpClaim[];
}

export function splitClaims(claims: readonly SrpClaim[]): QueueSplit {
  const pending: SrpClaim[] = [];
  const owed: SrpClaim[] = [];
  const history: SrpClaim[] = [];
  for (const claim of claims) {
    if (claim.state === 'pending') pending.push(claim);
    else if (claim.state === 'approved') owed.push(claim);
    else history.push(claim);
  }
  pending.sort((a, b) => a.filedAt - b.filedAt);
  owed.sort((a, b) => (a.decidedAt ?? 0) - (b.decidedAt ?? 0));
  history.sort((a, b) => (b.closedAt ?? b.decidedAt ?? 0) - (a.closedAt ?? a.decidedAt ?? 0));
  return { pending, owed, history };
}

export const sumAmounts = (claims: readonly SrpClaim[]): number =>
  claims.reduce((total, claim) => total + (claim.amount ?? 0), 0);

export const canBulkApprove = (claim: SrpClaim): boolean => claim.amount !== null;

export function typedAmount(text: string | undefined): number | null {
  if (text === undefined || text === '') return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

export function approveAmount(claim: SrpClaim, typed: string | undefined): number | null {
  return claim.amount ?? typedAmount(typed);
}

export function pruneSelection(selected: readonly number[], rows: readonly SrpClaim[]): number[] {
  const ids = new Set(rows.map((r) => r.killmailId));
  return selected.filter((id) => ids.has(id));
}

export const MAX_SRP_BATCH = 50;

export async function runInBatches<I extends { killmailId: number }>(
  items: readonly I[],
  call: (chunk: I[]) => Promise<SrpBatchOutcome>
): Promise<SrpBatchOutcome> {
  const results: SrpBatchResult[] = [];
  for (const batch of chunk(items, MAX_SRP_BATCH)) {
    try {
      results.push(...(await call(batch)).results);
    } catch (error) {
      const reason = callableErrorReason(error) ?? 'generic';
      results.push(
        ...batch.map((c) => ({
          ok: false as const,
          killmailId: c.killmailId,
          reason,
          message: reason,
        }))
      );
    }
  }
  return { results };
}
