/**
 * The SRP officer queue's backend as the client sees it (ADR 0026).
 * Reads go straight to Firestore under the rules (`verifySrpOfficer` first, which records the
 * 24-hour officer access); every change is a callable that re-checks the Character's roles live,
 * guards the state change in a transaction and audits it. Only a short-lived access token is
 * sent. Refusals carry a `details.reason`: claim-not-found, illegal-transition, reason-required,
 * amount-required, amount-unchanged, amount-changed (the amount moved since the officer looked), not-an-officer, wrong-corp, role-required.
 */
import type { CallableAction } from '../../../functions/src/callableManifest';
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
  SrpMarkPaidItem,
} from './srpClaimTypes';
import { invalidateSrpOfficer } from './srpClient';
import type { SrpClaimValues } from './srpTypes';
import { call } from './taxBook/bookClient';

const corpDoc = (characterId: number, corporationId: number, name: string) =>
  collection(getSyncFirestore(characterId), 'corps', String(corporationId), name);

/** Most documents an export or audit read takes; far past what a corporation files inside retention. */
export const SRP_READ_CAP = 2000;

const isOpen = (c: SrpClaim) => c.state === 'pending' || c.state === 'approved';

/** The Pending and Approved claims: what an officer works. A bounded, single-field query. */
export async function readSrpClaims(
  characterId: number,
  corporationId: number
): Promise<SrpClaim[]> {
  const stand = srpOfficerBackendOverride();
  if (stand) return stand.claims().filter(isOpen);
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    query(
      corpDoc(characterId, corporationId, 'srpClaims'),
      where('state', 'in', ['pending', 'approved'])
    )
  );
  return snap.docs.map((d) => d.data() as SrpClaim);
}

/**
 * The newest closed (Paid or Rejected) claims, newest first. `closedAt` exists only on closed
 * claims, so ordering by it leaves the open ones out; retention bounds the rest.
 */
export async function readSrpHistory(
  characterId: number,
  corporationId: number,
  count = 100
): Promise<SrpClaim[]> {
  const stand = srpOfficerBackendOverride();
  if (stand) {
    return stand
      .claims()
      .filter((c) => !isOpen(c))
      .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
      .slice(0, count);
  }
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    query(
      corpDoc(characterId, corporationId, 'srpClaims'),
      orderBy('closedAt', 'desc'),
      limitTo(count)
    )
  );
  return snap.docs.map((d) => d.data() as SrpClaim);
}

/** The newest entries of the corporation's audit log, newest first; `count` null reads up to `SRP_READ_CAP`. */
export async function readSrpActivity(
  characterId: number,
  corporationId: number,
  count: number | null = 100
): Promise<SrpAuditEntry[]> {
  const stand = srpOfficerBackendOverride();
  if (stand) return stand.activity();
  await ensureSignedIn(characterId);
  const log = corpDoc(characterId, corporationId, 'srpAudit');
  const snap = await getDocs(
    count === null
      ? query(log, orderBy('at', 'desc'), limitTo(SRP_READ_CAP))
      : query(log, orderBy('at', 'desc'), limitTo(count))
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SrpAuditEntry, 'id'>) }));
}

/** Every claim, any state, up to `SRP_READ_CAP`. Retention bounds the closed ones. */
export async function readAllSrpClaims(
  characterId: number,
  corporationId: number
): Promise<SrpClaim[]> {
  const stand = srpOfficerBackendOverride();
  if (stand) return stand.claims();
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    query(corpDoc(characterId, corporationId, 'srpClaims'), limitTo(SRP_READ_CAP))
  );
  return snap.docs.map((d) => d.data() as SrpClaim);
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
    query(
      corpDoc(characterId, corporationId, 'srpAudit'),
      where('detail.killmailId', '==', killmailId)
    )
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<SrpAuditEntry, 'id'>) }))
    .sort((a, b) => a.at - b.at);
}

/** The lost ship's Jita value against the nearest Doctrine Fit's (no cargo), for the claim detail. */
export async function getSrpClaimValues(
  characterId: number,
  corporationId: number,
  killmailId: number
): Promise<SrpClaimValues> {
  const stand = srpOfficerBackendOverride();
  if (stand) return stand.claimValues(killmailId);
  return officerCall(characterId, corporationId, 'getSrpClaimValuesCallable', { killmailId });
}

/** A refusal that says the remembered officer verdict or the view it came from may be stale. */
const DOUBTED_REASONS: ReadonlySet<string> = new Set([
  'amount-changed',
  'permission-denied',
  'not-an-officer',
  'role-required',
  'wrong-corp',
]);

async function officerCall<Out>(
  characterId: number,
  corporationId: number,
  name: CallableAction,
  data: Record<string, unknown>
): Promise<Out> {
  const accessToken = await getValidAccessToken(characterId);
  try {
    const out = await call<Record<string, unknown>, Out>(characterId, name, {
      corporationId,
      accessToken,
      ...data,
    });
    const results = (out as Partial<SrpBatchOutcome>).results;
    if (results?.some((r) => !r.ok && DOUBTED_REASONS.has(r.reason))) {
      invalidateSrpOfficer(characterId, corporationId);
    }
    return out;
  } catch (err) {
    invalidateSrpOfficer(characterId, corporationId);
    throw err;
  }
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

/** Approved to Paid: the officer paid in game; the app moves no ISK. `expectedAmount` guards a stale view. */
export function markSrpClaimPaid(
  characterId: number,
  corporationId: number,
  item: SrpMarkPaidItem
): Promise<SrpClaimOutcome> {
  const stand = srpOfficerBackendOverride();
  if (stand) return Promise.resolve().then(() => stand.markPaid(item));
  return officerCall(characterId, corporationId, 'markSrpClaimPaidCallable', { ...item });
}

export function markSrpClaimsPaid(
  characterId: number,
  corporationId: number,
  items: SrpMarkPaidItem[]
): Promise<SrpBatchOutcome> {
  const stand = srpOfficerBackendOverride();
  if (stand) return Promise.resolve().then(() => stand.markPaidMany(items));
  return officerCall(characterId, corporationId, 'markSrpClaimsPaidCallable', { claims: items });
}
