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

async function settle(
  killmailId: number,
  run: () => Promise<SrpClaimOutcome>
): Promise<SrpBatchResult> {
  try {
    return { ok: true, ...(await run()) };
  } catch (err) {
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
