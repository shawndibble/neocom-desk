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
  type QueryConstraint,
  type QuerySnapshot,
} from 'firebase/firestore/lite';
import { getValidAccessToken } from '@/auth/session';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { srpOfficerBackendOverride, type SrpOfficerBackendOverride } from './srpBackendOverride';
import type {
  SrpApproveItem,
  SrpAuditEntry,
  SrpBatchOutcome,
  SrpClaim,
  SrpClaimOutcome,
  SrpMarkPaidItem,
} from './srpClaimTypes';
import { delegate } from './srpBackendDelegate';
import { invalidateSrpOfficer } from './srpClient';
import type { SrpClaimValues } from './srpTypes';
import { callSignedIn } from '@/sync/signedInCallable';

const corpDoc = (characterId: number, corporationId: number, name: string) =>
  collection(getSyncFirestore(characterId), 'corps', String(corporationId), name);

/** Most documents an export or audit read takes; far past what a corporation files inside retention. */
export const SRP_READ_CAP = 2000;

const isOpen = (c: SrpClaim) => c.state === 'pending' || c.state === 'approved';

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
    const out = await callSignedIn<Record<string, unknown>, Out>(characterId, name, {
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

/** A bounded read of `srpClaims` under the rules. */
async function claimsRead(
  characterId: number,
  corporationId: number,
  ...constraints: QueryConstraint[]
): Promise<SrpClaim[]> {
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    query(corpDoc(characterId, corporationId, 'srpClaims'), ...constraints)
  );
  return snap.docs.map((d) => d.data() as SrpClaim);
}

const auditEntries = (snap: QuerySnapshot) =>
  snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SrpAuditEntry, 'id'>) }));

const real = {
  openClaims: (characterId: number, corporationId: number) =>
    claimsRead(characterId, corporationId, where('state', 'in', ['pending', 'approved'])),
  // `closedAt` exists only on closed claims, so ordering by it leaves the open ones out.
  history: (characterId: number, corporationId: number, count = 100) =>
    claimsRead(characterId, corporationId, orderBy('closedAt', 'desc'), limitTo(count)),
  allClaims: (characterId: number, corporationId: number) =>
    claimsRead(characterId, corporationId, limitTo(SRP_READ_CAP)),
  activity: async (characterId: number, corporationId: number, count: number | null = 100) => {
    await ensureSignedIn(characterId);
    const log = corpDoc(characterId, corporationId, 'srpAudit');
    return auditEntries(
      await getDocs(query(log, orderBy('at', 'desc'), limitTo(count ?? SRP_READ_CAP)))
    );
  },
  claimAudit: async (characterId: number, corporationId: number, killmailId: number) => {
    await ensureSignedIn(characterId);
    const snap = await getDocs(
      query(
        corpDoc(characterId, corporationId, 'srpAudit'),
        where('detail.killmailId', '==', killmailId)
      )
    );
    return auditEntries(snap).sort((a, b) => a.at - b.at);
  },
  claimValues: (
    characterId: number,
    corporationId: number,
    killmailId: number
  ): Promise<SrpClaimValues> =>
    officerCall(characterId, corporationId, 'getSrpClaimValuesCallable', { killmailId }),
  approve: (
    characterId: number,
    corporationId: number,
    item: SrpApproveItem
  ): Promise<SrpClaimOutcome> =>
    officerCall(characterId, corporationId, 'approveSrpClaimCallable', { ...item }),
  approveMany: (
    characterId: number,
    corporationId: number,
    claims: SrpApproveItem[]
  ): Promise<SrpBatchOutcome> =>
    officerCall(characterId, corporationId, 'approveSrpClaimsCallable', { claims }),
  reject: (
    characterId: number,
    corporationId: number,
    killmailId: number,
    reason: string
  ): Promise<SrpClaimOutcome> =>
    officerCall(characterId, corporationId, 'rejectSrpClaimCallable', { killmailId, reason }),
  change: (
    characterId: number,
    corporationId: number,
    killmailId: number,
    amount: number,
    reason: string
  ): Promise<SrpClaimOutcome> =>
    officerCall(characterId, corporationId, 'changeSrpClaimAmountCallable', {
      killmailId,
      amount,
      reason,
    }),
  markPaid: (
    characterId: number,
    corporationId: number,
    item: SrpMarkPaidItem
  ): Promise<SrpClaimOutcome> =>
    officerCall(characterId, corporationId, 'markSrpClaimPaidCallable', { ...item }),
  markPaidMany: (
    characterId: number,
    corporationId: number,
    claims: SrpMarkPaidItem[]
  ): Promise<SrpBatchOutcome> =>
    officerCall(characterId, corporationId, 'markSrpClaimsPaidCallable', { claims }),
};

type SrpOfficerBackend = typeof real;

/** A story's in-memory stand-in, as the same backend: the queries' filtering and ordering live here. */
const fromStandIn = (s: SrpOfficerBackendOverride): SrpOfficerBackend => ({
  openClaims: async () => s.claims().filter(isOpen),
  history: async (_character, _corp, count) =>
    s
      .claims()
      .filter((c) => !isOpen(c))
      .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
      .slice(0, count),
  allClaims: async () => s.claims(),
  activity: async () => s.activity(),
  claimAudit: async (_character, _corp, killmailId) => s.claimAudit(killmailId),
  claimValues: async (_character, _corp, killmailId) => s.claimValues(killmailId),
  approve: async (_character, _corp, item) => s.approve(item),
  approveMany: async (_character, _corp, items) => s.approveMany(items),
  reject: async (_character, _corp, killmailId, reason) => s.reject(killmailId, reason),
  change: async (_character, _corp, killmailId, amount, reason) =>
    s.change(killmailId, amount, reason),
  markPaid: async (_character, _corp, item) => s.markPaid(item),
  markPaidMany: async (_character, _corp, items) => s.markPaidMany(items),
});

const backend = (): SrpOfficerBackend => {
  const stand = srpOfficerBackendOverride();
  return stand ? fromStandIn(stand) : real;
};

const op = delegate(backend);

/** The Pending and Approved claims: what an officer works. A bounded, single-field query. */
export const readSrpClaims = op('openClaims');

/** The newest closed (Paid or Rejected) claims, newest first; retention bounds the rest. */
export const readSrpHistory = op('history');

/** The newest entries of the corporation's audit log, newest first; `count` null reads up to `SRP_READ_CAP`. */
export const readSrpActivity = op('activity');

/** Every claim, any state, up to `SRP_READ_CAP`. Retention bounds the closed ones. */
export const readAllSrpClaims = op('allClaims');

/** Every audit entry about one claim, oldest first. */
export const readSrpClaimAudit = op('claimAudit');

/** The lost ship's Jita value against the nearest Doctrine Fit's (no cargo), for the claim detail. */
export const getSrpClaimValues = op('claimValues');

/** Pending to Approved. A typed or differing `amount` is recorded; a differing one needs a `reason`. */
export const approveSrpClaim = op('approve');

/** Approve many at once; each claim gets its own result. */
export const approveSrpClaims = op('approveMany');

/** Pending to Rejected; the reason is required and is what the pilot is told. */
export const rejectSrpClaim = op('reject');

/** A pending claim's amount, with the reason it was changed; the claim stays pending. */
export const changeSrpClaimAmount = op('change');

/** Approved to Paid: the officer paid in game; the app moves no ISK. `expectedAmount` guards a stale view. */
export const markSrpClaimPaid = op('markPaid');

export const markSrpClaimsPaid = op('markPaidMany');
