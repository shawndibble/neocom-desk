// SRP officer actions (ADR 0026): the admin-SDK half. Each action re-checks the
// caller's roles live (Director, Accountant or CEO), then moves a claim in a transaction that
// re-reads it, so a double click or a racing second officer meets the state guard, and appends the
// audit entry in the same transaction. Rules and shapes: srpOfficer.ts.
// Returns what the result mail needs (pilot, amount, reason); sends nothing.

import type { Caller } from './actorAuth.js';
import { HttpsError } from 'firebase-functions/v2/https';
import type { BookCall } from './corpTaxBook.js';
import {
  decideApprove,
  decideChangeAmount,
  decideMarkPaid,
  decideReject,
  type ApproveItem,
  type ChangeAmountItem,
  type Decision,
  type MarkPaidItem,
  type Officer,
  type RejectItem,
  type SrpClaimOutcome,
} from './srpOfficer.js';
import { appendSrpAudit, authorizeSrpOfficer, claimRef, type SrpDeps } from './srpStore.js';

/** One claim's result in a batch: the outcome, or why that claim was refused. */
export type SrpBatchResult =
  | ({ ok: true } & SrpClaimOutcome)
  | { ok: false; killmailId: number; reason: string; message: string };

export interface SrpBatchOutcome {
  results: SrpBatchResult[];
}

async function apply(
  deps: SrpDeps,
  call: BookCall,
  officer: Officer,
  killmailId: number,
  action: string,
  decide: (claim: Record<string, unknown> | undefined, now: number) => Decision
): Promise<SrpClaimOutcome> {
  const ref = claimRef(deps.db, call.corporationId, killmailId);
  return deps.db.runTransaction(async (tx) => {
    const now = deps.now();
    const decision = decide((await tx.get(ref)).data(), now);
    tx.update(ref, decision.patch);
    appendSrpAudit(tx, deps, call.corporationId, officer, action, decision.detail);
    return decision.outcome;
  });
}

/** A refusal in a batch is a result, not a failure of the whole call. */
async function settle(
  killmailId: number,
  run: () => Promise<SrpClaimOutcome>
): Promise<SrpBatchResult> {
  try {
    return { ok: true, ...(await run()) };
  } catch (err) {
    // Any failure is that claim's result: the claims before it are already committed.
    if (!(err instanceof HttpsError)) {
      return { ok: false, killmailId, reason: 'internal', message: 'Could not save this claim' };
    }
    const reason = (err.details as { reason?: string } | undefined)?.reason;
    return { ok: false, killmailId, reason: reason ?? err.code, message: err.message };
  }
}

type Decide<I> = (
  claim: Record<string, unknown> | undefined,
  item: I,
  officer: Officer,
  now: number
) => Decision;

async function decideOne<I extends { killmailId: number }>(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  item: I,
  action: string,
  decide: Decide<I>
): Promise<SrpClaimOutcome> {
  const officer = await authorizeSrpOfficer(deps, caller, call, 'edit');
  return apply(deps, call, officer, item.killmailId, action, (claim, now) =>
    decide(claim, item, officer, now)
  );
}

async function decideMany<I extends { killmailId: number }>(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  items: I[],
  action: string,
  decide: Decide<I>
): Promise<SrpBatchOutcome> {
  const officer = await authorizeSrpOfficer(deps, caller, call, 'edit');
  const results: SrpBatchResult[] = [];
  for (const item of items) {
    results.push(
      await settle(item.killmailId, () =>
        apply(deps, call, officer, item.killmailId, action, (claim, now) =>
          decide(claim, item, officer, now)
        )
      )
    );
  }
  return { results };
}

export const approveSrpClaim = (deps: SrpDeps, caller: Caller, call: BookCall, item: ApproveItem) =>
  decideOne(deps, caller, call, item, 'approveClaim', decideApprove);

/** Approve many at once (no overrides: a claim that needs a typed amount is refused on its own). */
export const approveSrpClaims = (
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  items: ApproveItem[]
) => decideMany(deps, caller, call, items, 'approveClaim', decideApprove);

export const rejectSrpClaim = (deps: SrpDeps, caller: Caller, call: BookCall, item: RejectItem) =>
  decideOne(deps, caller, call, item, 'rejectClaim', decideReject);

export const changeSrpClaimAmount = (
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  item: ChangeAmountItem
) => decideOne(deps, caller, call, item, 'changeClaimAmount', decideChangeAmount);

export const markSrpClaimPaid = (
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  item: MarkPaidItem
) => decideOne(deps, caller, call, item, 'markClaimPaid', decideMarkPaid);

export const markSrpClaimsPaid = (
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  items: MarkPaidItem[]
) => decideMany(deps, caller, call, items, 'markClaimPaid', decideMarkPaid);
