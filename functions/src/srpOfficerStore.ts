// SRP officer actions (issue #4853, epic #4608, ADR 0026): the admin-SDK half. Each action re-checks the
// caller's roles live (Director, Accountant or CEO), then moves a claim in a transaction that
// re-reads it, so a double click or a racing second officer meets the state guard, and appends the
// audit entry in the same transaction. Rules and shapes: srpOfficer.ts. The result mail is #4854: these
// return what it needs (pilot, amount, reason) and send nothing.

import { HttpsError } from 'firebase-functions/v2/https';
import type { BookCall } from './corpTaxBook.js';
import type { Caller } from './corpTaxBookStore.js';
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

const officerOf = (access: Officer): Officer => ({
  characterId: access.characterId,
  characterName: access.characterName,
});

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

export async function approveSrpClaim(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  item: ApproveItem
): Promise<SrpClaimOutcome> {
  const officer = officerOf(await authorizeSrpOfficer(deps, caller, call, 'edit'));
  return apply(deps, call, officer, item.killmailId, 'approveClaim', (claim, now) =>
    decideApprove(claim, item, officer, now)
  );
}

/** Approve many at once (no overrides: a claim that needs a typed amount is refused on its own). */
export async function approveSrpClaims(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  items: ApproveItem[]
): Promise<SrpBatchOutcome> {
  const officer = officerOf(await authorizeSrpOfficer(deps, caller, call, 'edit'));
  const results: SrpBatchResult[] = [];
  for (const item of items) {
    results.push(
      await settle(item.killmailId, () =>
        apply(deps, call, officer, item.killmailId, 'approveClaim', (claim, now) =>
          decideApprove(claim, item, officer, now)
        )
      )
    );
  }
  return { results };
}

export async function rejectSrpClaim(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  item: RejectItem
): Promise<SrpClaimOutcome> {
  const officer = officerOf(await authorizeSrpOfficer(deps, caller, call, 'edit'));
  return apply(deps, call, officer, item.killmailId, 'rejectClaim', (claim, now) =>
    decideReject(claim, item, officer, now)
  );
}

export async function changeSrpClaimAmount(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  item: ChangeAmountItem
): Promise<SrpClaimOutcome> {
  const officer = officerOf(await authorizeSrpOfficer(deps, caller, call, 'edit'));
  return apply(deps, call, officer, item.killmailId, 'changeClaimAmount', (claim, now) =>
    decideChangeAmount(claim, item, officer, now)
  );
}

export async function markSrpClaimPaid(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  item: MarkPaidItem
): Promise<SrpClaimOutcome> {
  const officer = officerOf(await authorizeSrpOfficer(deps, caller, call, 'edit'));
  return apply(deps, call, officer, item.killmailId, 'markClaimPaid', (claim, now) =>
    decideMarkPaid(claim, item, officer, now)
  );
}

export async function markSrpClaimsPaid(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  items: MarkPaidItem[]
): Promise<SrpBatchOutcome> {
  const officer = officerOf(await authorizeSrpOfficer(deps, caller, call, 'edit'));
  const results: SrpBatchResult[] = [];
  for (const item of items) {
    results.push(
      await settle(item.killmailId, () =>
        apply(deps, call, officer, item.killmailId, 'markClaimPaid', (claim, now) =>
          decideMarkPaid(claim, item, officer, now)
        )
      )
    );
  }
  return { results };
}
