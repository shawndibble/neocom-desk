/**
 * The moon owner's read model, client side (#4512, spec #4504). The server
 * writes `corpTaxBooks/{collector}/feederViews/{feeder}/…`; the client reads it
 * under the viewer access record (`getFeederViewAccess`) and changes nothing
 * but through the callables. It holds no miner debts, statements, miner rate or
 * margin. Player-facing text never says feeder or Collector.
 */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore/lite';
import { httpsCallable } from 'firebase/functions';
import { getValidAccessToken } from '@/auth/session';
import type { Payee } from '@/engine/corpTaxBook/payouts';
import { getSyncFirestore, getSyncFunctions } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';

export interface FeederViewRateEntry {
  kind: 'requested' | 'agreed';
  pct: number;
  /** UTC day. */
  effectiveFrom: string;
  recordedAt: string;
}

/** Who a moon owner is paid as: a corporation or a player. */
export type FeederPayee = Payee;

/** `feederViews/{feeder}`. */
export interface FeederViewSummary {
  schemaVersion: 1;
  feederCorporationId: number;
  collectorCorporationId: number;
  collectorName: string | null;
  status: 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';
  mode: 'normal' | 'settled-otherwise';
  note: string | null;
  builtAt: number;
  coverageFrom: string | null;
  coverageTo: string | null;
  leftAt: number | null;
  lastReadWellAt: number | null;
  /** Non-null: the ledger cannot be read, so the page shows the stale banner. */
  staleSince: number | null;
  effectiveRatePct: number | null;
  requestedRatePct: number | null;
  agreedRatePct: number | null;
  rateHistory: FeederViewRateEntry[];
  minedVolume: number;
  minedValueIsk: number;
  accruedIsk: number;
  paidIsk: number;
  balanceKind: 'owed' | 'credit' | 'even' | 'none';
  balanceIsk: number;
  lastPayout: { date: string; amount: number } | null;
  refineryCount: number;
  unpricedDays: number;
  dismissedAt: number | null;
  /** A pending removal (#4520): when it started and, once its notice is out, when it takes effect. */
  removalStartedAt?: number | null;
  removalEffectiveAt?: number | null;
  /** Who the moon owner is paid as; null or absent (a view built before #4619) means the moon owner corporation. */
  payee?: FeederPayee | null;
}

export interface FeederViewLine {
  characterId: number;
  structureId: number;
  volume: number;
  valueIsk: number;
}

/** `feederViews/{feeder}/days/{date}`: covered days only. */
export interface FeederViewDay {
  date: string;
  billable: boolean;
  pct: number | null;
  dueIsk: number;
  valueIsk: number;
  lines: FeederViewLine[];
}

/** `feederViews/{feeder}/refineries/{structureId}`. */
export interface FeederViewRefinery {
  structureId: number;
  label: string | null;
  solarSystemId: number | null;
}

/** `feederViews/{feeder}/payouts/{id}`. */
export interface FeederViewPayout {
  date: string;
  amount: number;
  method: 'donation' | 'other';
  status: 'recorded' | 'waiting-for-journal' | 'matched';
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
  /** CEO, Director or Accountant of the moon owner: may ask for a rate and dismiss. */
  canEdit: boolean;
}

/**
 * The invite code a Reconnect sends with the grant round trip: the owner is
 * already handled, so the server matches the grant to its existing record
 * instead of an invite.
 */
export const RECONNECT_CODE = 'reconnect-existing';

async function call<In, Out>(characterId: number, name: string, data: In): Promise<Out> {
  await ensureSignedIn(characterId);
  return (await httpsCallable<In, Out>(getSyncFunctions(), name)(data)).data;
}

/** Live role check; records the 24h viewer access and builds the view when it is absent. */
export async function getFeederViewAccess(
  characterId: number,
  corporationId: number
): Promise<FeederViewAccess> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'getCorpTaxBookFeederViewAccessCallable', {
    corporationId,
    accessToken,
  });
}

/** Records the moon owner's requested rate. It never changes an agreed rate. */
export async function requestFeederRate(
  characterId: number,
  corporationId: number,
  pct: number
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'requestCorpTaxBookFeederRateCallable', {
    corporationId,
    accessToken,
    pct,
  });
}

/** The moon owner's officers name who it is paid as. The accounting corporation cannot. */
export async function setFeederPayee(
  characterId: number,
  corporationId: number,
  payee: FeederPayee
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'setCorpTaxBookFeederPayeeCallable', {
    corporationId,
    accessToken,
    payee,
  });
}

/** Dismiss the after-leaving section for the corporation's officers. */
export async function dismissFeederHistory(
  characterId: number,
  corporationId: number
): Promise<{ ok: true }> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'dismissCorpTaxBookFeederHistoryCallable', {
    corporationId,
    accessToken,
  });
}

/** Reads the view under the viewer's access record. `null` when the server has not built it. */
export async function readFeederView(
  collectorCorporationId: number,
  feederCorporationId: number
): Promise<FeederView | null> {
  const base = [
    getSyncFirestore(),
    'corpTaxBooks',
    String(collectorCorporationId),
    'feederViews',
  ] as const;
  const summary = await getDoc(doc(...base, String(feederCorporationId)));
  if (!summary.exists()) return null;
  const sub = async <T>(name: string): Promise<T[]> =>
    (await getDocs(collection(...base, String(feederCorporationId), name))).docs.map(
      (d) => d.data() as T
    );
  const [days, refineries, payouts] = await Promise.all([
    sub<FeederViewDay>('days'),
    sub<FeederViewRefinery>('refineries'),
    sub<FeederViewPayout>('payouts'),
  ]);
  return { summary: summary.data() as FeederViewSummary, days, refineries, payouts };
}

/** Access, then the view: one call for the page. */
export async function loadFeederView(
  characterId: number,
  corporationId: number
): Promise<{ access: FeederViewAccess; view: FeederView | null }> {
  const access = await getFeederViewAccess(characterId, corporationId);
  return {
    access,
    view: await readFeederView(access.collectorCorporationId, corporationId),
  };
}
