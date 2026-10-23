/**
 * The SRP officer queue's backend as the client sees it (issue #4853, epic #4608, ADR 0026).
 * Reads go straight to Firestore under the rules (`verifySrpOfficer` first, which records the
 * 24-hour officer access); every change is a callable that re-checks the Character's roles live,
 * guards the state change in a transaction and audits it. Only a short-lived access token is
 * sent. Refusals carry a `details.reason`: claim-not-found, illegal-transition, reason-required,
 * amount-required, amount-unchanged, not-an-officer, wrong-corp, role-required.
 */
import {
  collection,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  where,
} from 'firebase/firestore/lite';
import { getValidAccessToken } from '@/auth/session';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { srpOfficerBackendOverride } from './srpOfficerBackendOverride';
import type {
  SrpApproveItem,
  SrpAuditEntry,
  SrpBatchOutcome,
  SrpClaim,
  SrpClaimOutcome,
} from './srpClaimTypes';
import { call } from './taxBook/bookClient';

const corpDoc = (corporationId: number, name: string) =>
  collection(getSyncFirestore(), 'corps', String(corporationId), name);

/** Every claim of the corporation: retention (#4856) bounds the closed ones. */
export async function readSrpClaims(
  characterId: number,
  corporationId: number
): Promise<SrpClaim[]> {
  const stand = srpOfficerBackendOverride();
  if (stand) return stand.claims();
  await ensureSignedIn(characterId);
  const snap = await getDocs(corpDoc(corporationId, 'srpClaims'));
  return snap.docs.map((d) => d.data() as SrpClaim);
}

/** The newest entries of the corporation's audit log, newest first. */
export async function readSrpActivity(
  characterId: number,
  corporationId: number,
  count = 100
): Promise<SrpAuditEntry[]> {
  const stand = srpOfficerBackendOverride();
  if (stand) return stand.activity();
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    query(corpDoc(corporationId, 'srpAudit'), orderBy('at', 'desc'), limitTo(count))
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SrpAuditEntry, 'id'>) }));
}

/** Every audit entry about one claim, oldest first. */
export async function readSrpClaimAudit(
  characterId: number,
  corporationId: number,
  killmailId: number
): Promise<SrpAuditEntry[]> {
  const stand = srpOfficerBackendOverride();
  if (stand) return stand.claimAudit(killmailId);
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    query(corpDoc(corporationId, 'srpAudit'), where('detail.killmailId', '==', killmailId))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<SrpAuditEntry, 'id'>) }))
    .sort((a, b) => a.at - b.at);
}

async function officerCall<Out>(
  characterId: number,
  corporationId: number,
  name: string,
  data: Record<string, unknown>
): Promise<Out> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, name, { corporationId, accessToken, ...data });
}

/** Pending to Approved. A typed or differing `amount` is recorded; a differing one needs a `reason`. */
export function approveSrpClaim(
  characterId: number,
  corporationId: number,
  item: SrpApproveItem
): Promise<SrpClaimOutcome> {
  const stand = srpOfficerBackendOverride();
  if (stand) return Promise.resolve().then(() => stand.approve(item));
  return officerCall(characterId, corporationId, 'approveSrpClaimCallable', { ...item });
}

/** Approve many at once; each claim gets its own result. */
export function approveSrpClaims(
  characterId: number,
  corporationId: number,
  claims: SrpApproveItem[]
): Promise<SrpBatchOutcome> {
  const stand = srpOfficerBackendOverride();
  if (stand) return Promise.resolve().then(() => stand.approveMany(claims));
  return officerCall(characterId, corporationId, 'approveSrpClaimsCallable', { claims });
}

/** Pending to Rejected; the reason is required and is what the pilot is told. */
export function rejectSrpClaim(
  characterId: number,
  corporationId: number,
  killmailId: number,
  reason: string
): Promise<SrpClaimOutcome> {
  const stand = srpOfficerBackendOverride();
  if (stand) return Promise.resolve().then(() => stand.reject(killmailId, reason));
  return officerCall(characterId, corporationId, 'rejectSrpClaimCallable', { killmailId, reason });
}

/** A pending claim's amount, with the reason it was changed; the claim stays pending. */
export function changeSrpClaimAmount(
  characterId: number,
  corporationId: number,
  killmailId: number,
  amount: number,
  reason: string
): Promise<SrpClaimOutcome> {
  const stand = srpOfficerBackendOverride();
  if (stand) return Promise.resolve().then(() => stand.change(killmailId, amount, reason));
  return officerCall(characterId, corporationId, 'changeSrpClaimAmountCallable', {
    killmailId,
    amount,
    reason,
  });
}

/** Approved to Paid: the officer paid in game; the app moves no ISK. */
export function markSrpClaimPaid(
  characterId: number,
  corporationId: number,
  killmailId: number
): Promise<SrpClaimOutcome> {
  const stand = srpOfficerBackendOverride();
  if (stand) return Promise.resolve().then(() => stand.markPaid(killmailId));
  return officerCall(characterId, corporationId, 'markSrpClaimPaidCallable', { killmailId });
}

export function markSrpClaimsPaid(
  characterId: number,
  corporationId: number,
  killmailIds: number[]
): Promise<SrpBatchOutcome> {
  const stand = srpOfficerBackendOverride();
  if (stand) return Promise.resolve().then(() => stand.markPaidMany(killmailIds));
  return officerCall(characterId, corporationId, 'markSrpClaimsPaidCallable', { killmailIds });
}
