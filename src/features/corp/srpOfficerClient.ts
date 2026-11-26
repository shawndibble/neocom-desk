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

export const SRP_READ_CAP = 2000;

const isOpen = (c: SrpClaim) => c.state === 'pending' || c.state === 'approved';

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

const fromStandIn = (s: SrpOfficerBackendOverride): SrpOfficerBackend => ({
  openClaims: async () => s.claims().filter(isOpen),
  history: async (_character, _corp, count = 100) =>
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

export const readSrpClaims = op('openClaims');

export const readSrpHistory = op('history');

export const readSrpActivity = op('activity');

export const readAllSrpClaims = op('allClaims');

export const readSrpClaimAudit = op('claimAudit');

export const getSrpClaimValues = op('claimValues');

export const approveSrpClaim = op('approve');

export const approveSrpClaims = op('approveMany');

export const rejectSrpClaim = op('reject');

export const changeSrpClaimAmount = op('change');

export const markSrpClaimPaid = op('markPaid');

export const markSrpClaimsPaid = op('markPaidMany');
