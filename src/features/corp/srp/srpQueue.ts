/**
 * The officer queue's pure side (issue #4853): which claims belong on which tab, and the sums the
 * summary line and the bulk bar show. No fetch, no React.
 */
import { callableErrorReason } from '@/lib/callableError';
import type { SrpBatchOutcome, SrpBatchResult, SrpClaim } from '../srpClaimTypes';

export type QueueTab = 'pending' | 'owed' | 'history';

export interface QueueSplit {
  /** Oldest first: the queue is worked from the top. */
  pending: SrpClaim[];
  /** Approved, not yet paid; oldest approval first. */
  owed: SrpClaim[];
  /** Paid and Rejected, newest first. */
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

/** Approve can apply at once only where an amount is known; a claim without one needs it typed first. */
export const canBulkApprove = (claim: SrpClaim): boolean => claim.amount !== null;

/** What a typed amount field holds, as whole ISK, or null when blank or not a positive whole number. */
export function typedAmount(text: string | undefined): number | null {
  if (text === undefined || text === '') return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** The amount Approve would send for a row: its own, else what was typed. */
export function approveAmount(claim: SrpClaim, typed: string | undefined): number | null {
  return claim.amount ?? typedAmount(typed);
}

/** Ticks belong to the rows they were made on: drop any that left the list. */
export function pruneSelection(selected: readonly number[], rows: readonly SrpClaim[]): number[] {
  const ids = new Set(rows.map((r) => r.killmailId));
  return selected.filter((id) => ids.has(id));
}

/** The server refuses a batch over this many claims (`MAX_SRP_BATCH` in functions). */
export const MAX_SRP_BATCH = 50;

/**
 * Runs a bulk call in server-sized chunks, one after another, and merges the per-claim results.
 * A chunk that throws becomes a refusal for each of its claims, so one result line still says
 * what happened to every claim.
 */
export async function runInBatches<I extends { killmailId: number }>(
  items: readonly I[],
  call: (chunk: I[]) => Promise<SrpBatchOutcome>
): Promise<SrpBatchOutcome> {
  const results: SrpBatchResult[] = [];
  for (let at = 0; at < items.length; at += MAX_SRP_BATCH) {
    const chunk = items.slice(at, at + MAX_SRP_BATCH);
    try {
      results.push(...(await call(chunk)).results);
    } catch (error) {
      const reason = callableErrorReason(error) ?? 'generic';
      results.push(
        ...chunk.map((c) => ({
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
