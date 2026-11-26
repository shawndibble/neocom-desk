import { collection, doc, getDoc, getDocs } from 'firebase/firestore/lite';
import { getValidAccessToken } from '@/auth/session';
import type { FeederMode } from '@/engine/corpTaxBook/feederAccrual';
import type { PayeeSetBy } from '@/engine/corpTaxBook/payeeChange';
import type { Payee } from '@/engine/corpTaxBook/payouts';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { callSignedIn } from '@/sync/signedInCallable';

export interface FeederViewRateEntry {
  kind: 'requested' | 'agreed';
  pct: number;
  effectiveFrom: string;
  recordedAt: string;
}

export interface FeederViewSummary {
  schemaVersion: 1;
  rulesVersion?: number;
  feederCorporationId: number;
  collectorCorporationId: number;
  collectorName: string | null;
  status: 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';
  mode: FeederMode;
  note: string | null;
  builtAt: number;
  coverageFrom: string | null;
  coverageTo: string | null;
  leftAt: number | null;
  lastReadWellAt: number | null;
  staleSince: number | null;
  effectiveRatePct: number | null;
  requestedRatePct: number | null;
  agreedRatePct: number | null;
  rateHistory: FeederViewRateEntry[];
  minedVolume: number;
  minedValueIsk: number;
  accruedIsk: number;
  pendingValueIsk?: number;
  paidIsk: number;
  balanceKind: 'owed' | 'credit' | 'even' | 'none';
  balanceIsk: number;
  lastPayout: { date: string; amount: number } | null;
  refineryCount: number;
  refineryIds?: number[];
  unpricedDays: number;
  dismissedAt: number | null;
  removalStartedAt?: number | null;
  removalEffectiveAt?: number | null;
  payee?: Payee | null;
  payeeSetBy?: PayeeSetBy | null;
  refineryNamesGranted?: boolean;
  chunkOreGranted?: boolean;
  popSharingOptedOut?: boolean;
  contentHash?: string;
}

export interface FeederViewLine {
  characterId: number;
  structureId: number;
  typeId?: number;
  volume: number;
  quantity?: number;
}

export interface FeederViewDay {
  date: string;
  lines: FeederViewLine[];
}

export interface FeederViewRefinery {
  structureId: number;
  label: string | null;
  labelSetAt?: string | null;
  solarSystemId: number | null;
  structureName?: string | null;
}

export interface FeederViewPayout {
  id: string;
  date: string;
  amount: number;
  method: 'donation' | 'other';
  status: 'recorded' | 'waiting-for-journal' | 'matched';
  disputed?: true;
}

export interface FeederView {
  summary: FeederViewSummary;
  days: FeederViewDay[];
  refineries: FeederViewRefinery[];
  payouts: FeederViewPayout[];
}

export interface FeederViewAccess {
  collectorCorporationId: number;
  expiresAt: number;
  canEdit: boolean;
}

export const RECONNECT_CODE = 'reconnect-existing';

export async function getFeederViewAccess(
  characterId: number,
  corporationId: number,
  collectorCorporationId?: number
): Promise<FeederViewAccess> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'getCorpTaxBookFeederViewAccessCallable', {
    corporationId,
    accessToken,
    ...(collectorCorporationId !== undefined ? { collectorCorporationId } : {}),
  });
}

export async function setOwnRefineryLabel(
  characterId: number,
  corporationId: number,
  structureId: number,
  label: string | null
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'setCorpTaxBookOwnRefineryLabelCallable', {
    corporationId,
    accessToken,
    structureId,
    label,
  });
}

export async function requestFeederRate(
  characterId: number,
  corporationId: number,
  pct: number
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'requestCorpTaxBookFeederRateCallable', {
    corporationId,
    accessToken,
    pct,
  });
}

export async function disputeFeederPayout(
  characterId: number,
  corporationId: number,
  payoutId: string,
  disputed: boolean
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'disputeCorpTaxBookFeederPayoutCallable', {
    corporationId,
    accessToken,
    payoutId,
    disputed,
  });
}

export async function setFeederPopSharing(
  characterId: number,
  corporationId: number,
  share: boolean
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'setCorpTaxBookFeederPopSharingCallable', {
    corporationId,
    accessToken,
    share,
  });
}

export interface PayeeSetResult {
  ok: true;
  changed?: boolean;
  at?: number;
  recipients?: number[];
}

export async function setFeederPayee(
  characterId: number,
  corporationId: number,
  payee: Payee,
  notify: boolean
): Promise<PayeeSetResult> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'setCorpTaxBookFeederPayeeCallable', {
    corporationId,
    accessToken,
    payee,
    notify,
  });
}

export async function dismissFeederHistory(
  characterId: number,
  corporationId: number,
  collectorCorporationId?: number
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'dismissCorpTaxBookFeederHistoryCallable', {
    corporationId,
    accessToken,
    ...(collectorCorporationId !== undefined ? { collectorCorporationId } : {}),
  });
}

const viewCache = new Map<string, { stamp: number; view: FeederView }>();

export const clearFeederViewCache = (): void => viewCache.clear();

export async function readFeederView(
  characterId: number,
  collectorCorporationId: number,
  feederCorporationId: number
): Promise<FeederView | null> {
  const base = [
    getSyncFirestore(characterId),
    'corps',
    String(collectorCorporationId),
    'feederViews',
  ] as const;
  const summarySnap = await getDoc(doc(...base, String(feederCorporationId)));
  const key = `${characterId}:${collectorCorporationId}:${feederCorporationId}`;
  if (!summarySnap.exists()) {
    viewCache.delete(key);
    return null;
  }
  const summary = summarySnap.data() as FeederViewSummary;
  const cached = viewCache.get(key);
  if (cached && cached.stamp === summary.builtAt) return { ...cached.view, summary };
  const sub = async <T>(name: string, withId = false): Promise<T[]> =>
    (await getDocs(collection(...base, String(feederCorporationId), name))).docs.map((d) =>
      withId ? ({ ...d.data(), id: d.id } as T) : (d.data() as T)
    );
  const [days, refineries, payouts] = await Promise.all([
    sub<FeederViewDay>('days'),
    sub<FeederViewRefinery>('refineries'),
    sub<FeederViewPayout>('payouts', true),
  ]);
  const view = { summary, days, refineries, payouts };
  viewCache.set(key, { stamp: summary.builtAt, view });
  return view;
}

export async function loadFeederView(
  characterId: number,
  corporationId: number,
  collectorCorporationId?: number
): Promise<{ access: FeederViewAccess; view: FeederView | null }> {
  const access = await getFeederViewAccess(characterId, corporationId, collectorCorporationId);
  return {
    access,
    view: await readFeederView(characterId, access.collectorCorporationId, corporationId),
  };
}
