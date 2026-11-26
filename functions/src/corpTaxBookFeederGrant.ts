import { utcDay } from './timeConstants.js';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import { encryptRefreshToken } from './alertGrantCrypto.js';
import type { RefreshedTokens } from './alertGrant.js';
import {
  dropCorpSyncGrant,
  grantRef,
  revokeStored,
  syncOneFeeder,
  type CorpSyncDeps,
  type CorpSyncGrantDoc,
} from './corpSyncGrant.js';
import {
  FEEDER_INVITES_COLLECTION,
  FEEDER_OF_COLLECTION,
  FEEDER_PREVIOUS_COLLECTION,
  REMOVAL_LINKS_COLLECTION,
  pctField,
} from './corpTaxBook.js';
import type { AuditAction } from './corpTaxBookKinds.js';
import { FEEDER_SYNC_SCOPES } from './corpSyncScopes.js';
import {
  closePeriod,
  deriveOwnerRateHistory,
  effectiveOwnerRatePct,
  isDayCovered,
  reconnectCoverageFrom,
  reopenPeriod,
} from './corpTaxBookEngine.js';
import type { CorporationLookup } from './corpTaxBookEsi.js';
import {
  acceptInviteCore,
  type AcceptFeederInviteResult,
  type AcceptUndo,
  type FeederRecord,
} from './corpTaxBookFeeders.js';
import {
  appendRequestedRate,
  feederViewRef,
  tryRebuildFeederView,
} from './corpTaxBookFeederView.js';
import {
  appendAudit,
  bookRef,
  feederRef,
  ownBookFloor,
  type BookDeps,
} from './corpTaxBookStore.js';
import { readFeederRows } from './corpTaxBookFeederRollup.js';
import type { SyncEsi } from './corpTaxBookSyncEsi.js';
import {
  requireLiveRoles,
  requireRolesScope,
  signedInCharacter,
  verifyAccessToken,
  verifyCallerToken,
  fail,
  type Caller,
} from './actorAuth.js';
import { refreshSharedPops } from './sharedPopsStore.js';

export interface FeederGrantDeps extends CorpSyncDeps {
  esi: SyncEsi;
  lookupCorporation: CorporationLookup;
}

const PURPOSE = 'corpSyncGrant' as const;

export const bookDeps = (deps: CorpSyncDeps): BookDeps => ({
  db: deps.db,
  now: deps.now,
  verifyToken: deps.verify,
  readIdentity: deps.readIdentity,
  ...(deps.openPrices ? { openPrices: deps.openPrices } : {}),
  ...(deps.corporationAlliance ? { corporationAlliance: deps.corporationAlliance } : {}),
});

export interface SaveFeederGrantInput {
  code: string;
  accessToken: string;
  refreshToken: string;
  requestedRatePct?: number;
}

export function parseSaveFeederGrantInput(data: unknown): SaveFeederGrantInput {
  const d = record(data);
  const out: SaveFeederGrantInput = {
    code: boundedString(d.code, 'code', 64),
    accessToken: boundedString(d.accessToken, 'accessToken', 8192),
    refreshToken: boundedString(d.refreshToken, 'refreshToken', 8192),
  };
  const rate = d.requestedRatePct;
  if (rate !== undefined && rate !== null) {
    out.requestedRatePct = pctField(rate, 'requestedRatePct');
  }
  return out;
}

export interface FeederCall {
  corporationId: number;
  accessToken: string;
  collectorCorporationId?: number;
}

export interface PreviousCollector {
  collectorCorporationId: number;
  leftAt: number;
}

export function previousCollectors(doc: Record<string, unknown> | undefined): PreviousCollector[] {
  if (!doc) return [];
  const history = Array.isArray(doc.history)
    ? (doc.history as unknown[]).filter(
        (e): e is PreviousCollector =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as PreviousCollector).collectorCorporationId === 'number' &&
          typeof (e as PreviousCollector).leftAt === 'number'
      )
    : [];
  if (history.length > 0) return history;
  return typeof doc.collectorCorporationId === 'number' && typeof doc.leftAt === 'number'
    ? [{ collectorCorporationId: doc.collectorCorporationId, leftAt: doc.leftAt }]
    : [];
}

export function withPreviousCollector(
  list: readonly PreviousCollector[],
  entry: PreviousCollector
): PreviousCollector[] {
  return [...list.filter((e) => e.collectorCorporationId !== entry.collectorCorporationId), entry];
}

const previousIds = (list: readonly PreviousCollector[], current?: number): number[] =>
  [...list]
    .reverse()
    .map((e) => e.collectorCorporationId)
    .filter((id) => id !== current);

const readPrevious = async (db: CorpSyncDeps['db'], corporationId: number) =>
  previousCollectors(
    (await db.collection(FEEDER_PREVIOUS_COLLECTION).doc(String(corporationId)).get()).data()
  );

export function parseFeederCall(data: unknown): FeederCall {
  const d = record(data);
  const corporationId = d.corporationId;
  if (
    typeof corporationId !== 'number' ||
    !Number.isSafeInteger(corporationId) ||
    corporationId <= 0
  ) {
    throw new HttpsError('invalid-argument', 'corporationId must be a positive integer');
  }
  const collector = d.collectorCorporationId;
  if (
    collector !== undefined &&
    (typeof collector !== 'number' || !Number.isSafeInteger(collector) || collector <= 0)
  ) {
    throw new HttpsError('invalid-argument', 'collectorCorporationId must be a positive integer');
  }
  return {
    corporationId,
    accessToken: boundedString(d.accessToken, 'accessToken', 8192),
    ...(collector !== undefined ? { collectorCorporationId: collector } : {}),
  };
}

export type SaveFeederGrantResult = AcceptFeederInviteResult;

export function feederGrantReadsStructures(scopes: readonly string[]): boolean {
  const [ledger, structures] = FEEDER_SYNC_SCOPES;
  if (!scopes.includes(ledger)) {
    fail('failed-precondition', 'Grant the corporation mining scope first', 'missing-scope');
  }
  if (scopes.some((s) => !(FEEDER_SYNC_SCOPES as readonly string[]).includes(s))) {
    fail(
      'permission-denied',
      'Token must carry only the mining, structure and notification scopes',
      'wrong-scopes'
    );
  }
  return scopes.includes(structures);
}

export const feederGrantReadsNotifications = (scopes: readonly string[]): boolean =>
  scopes.includes('esi-characters.read_notifications.v1');

export const RECONNECT_CODE = 'reconnect-existing';

const RECONNECTABLE: readonly FeederRecord['status'][] = [
  'active',
  'pending-removal',
  'disconnected',
];

interface ReconnectUndo {
  holder: number;
  grantedBy: number;
  prior: FeederRecord;
  reopened: boolean;
  coveragePeriods?: FeederRecord['coveragePeriods'];
}

async function reconnectCore(
  deps: BookDeps,
  feederCorp: number,
  holder: number,
  grantedBy: number,
  ownOf?: number
): Promise<AcceptFeederInviteResult & { reconnect: ReconnectUndo }> {
  const pointerRef = deps.db.collection(FEEDER_OF_COLLECTION).doc(String(feederCorp));
  return deps.db.runTransaction(async (tx) => {
    const collector: unknown = (await tx.get(pointerRef)).data()?.collectorCorporationId;
    if (typeof collector !== 'number' || (ownOf !== undefined && collector !== ownOf)) {
      fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
    }
    const ref = feederRef(deps.db, collector, feederCorp);
    const rec = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (
      !rec ||
      !RECONNECTABLE.includes(rec.status) ||
      (ownOf !== undefined && (rec.sameOwner !== true || rec.status !== 'active'))
    ) {
      fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
    }
    const patch: Record<string, unknown> = {
      grantHolder: holder,
      grantedBy,
      extractionsRefusedAt: FieldValue.delete(),
    };
    const reopened = rec.status === 'disconnected';
    let coveragePeriods: FeederRecord['coveragePeriods'] | undefined;
    if (reopened) {
      const today = utcDay(deps.now());
      coveragePeriods = reopenPeriod(
        rec.coveragePeriods,
        reconnectCoverageFrom(rec.coveragePeriods, today, utcDay(rec.joinedAt))
      );
      patch.status = 'active';
      patch.coveragePeriods = coveragePeriods;
      patch.disconnectedAt = FieldValue.delete();
      patch.staleSince = FieldValue.delete();
      patch.staleReason = FieldValue.delete();
    }
    tx.update(ref, patch);
    return {
      collectorCorporationId: collector,
      feederCorporationId: feederCorp,
      rejoined: false,
      reconnect: {
        holder,
        grantedBy,
        prior: rec,
        reopened,
        ...(coveragePeriods ? { coveragePeriods } : {}),
      },
    };
  });
}

const FIRST_PULL_FIELDS = [
  'staleSince',
  'staleReason',
  'lastSyncResult',
  'lastReadWellAt',
  'extractionsRefusedAt',
] as const;

async function undoReconnect(
  deps: BookDeps,
  collector: number,
  feederCorp: number,
  undo: ReconnectUndo
): Promise<void> {
  const ref = feederRef(deps.db, collector, feederCorp);
  const back = (key: keyof FeederRecord) =>
    undo.prior[key] === undefined ? FieldValue.delete() : undo.prior[key];
  await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!rec || rec.grantHolder !== undo.holder || rec.grantedBy !== undo.grantedBy) return;
    const update: Record<string, unknown> = {
      grantHolder: back('grantHolder'),
      grantedBy: back('grantedBy'),
    };
    for (const key of FIRST_PULL_FIELDS) update[key] = back(key);
    const sameCoverage =
      JSON.stringify(rec.coveragePeriods) === JSON.stringify(undo.coveragePeriods);
    if (undo.reopened && rec.status === 'active' && sameCoverage) {
      update.status = undo.prior.status;
      update.coveragePeriods = undo.prior.coveragePeriods;
      update.disconnectedAt = back('disconnectedAt');
    }
    tx.update(ref, update);
  });
}

export async function saveFeederGrant(
  deps: FeederGrantDeps,
  caller: Caller,
  input: SaveFeederGrantInput,
  options: { expectedFeederCorp?: number; reconnectOwnOf?: number } = {}
): Promise<SaveFeederGrantResult> {
  const callerId = signedInCharacter(caller);
  const supplied = await verifyAccessToken(deps.verify, input.accessToken);
  feederGrantReadsStructures(supplied.scopes);

  let refreshed: RefreshedTokens;
  try {
    refreshed = await deps.refresh(supplied.clientId, input.refreshToken);
  } catch (err) {
    deps.log('Feeder grant refresh token rejected', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    throw new HttpsError('unauthenticated', 'EVE refresh token rejected');
  }
  const orphan = async () => {
    try {
      await deps.revoke(supplied.clientId, refreshed.refreshToken);
    } catch {
      deps.log('Feeder grant token revoke failed after a refused save');
    }
  };

  let undo: AcceptUndo | undefined;
  let accepted: (AcceptFeederInviteResult & { undo?: AcceptUndo }) | undefined;
  let reconnect: ReconnectUndo | undefined;
  let previousGrant: CorpSyncGrantDoc | undefined;
  let grantWritten = false;
  try {
    const claims = await verifyAccessToken(deps.verify, refreshed.accessToken);
    if (claims.characterId !== supplied.characterId) {
      fail('permission-denied', 'Refresh token belongs to another Character', 'token-mismatch');
    }
    const readsStructures = feederGrantReadsStructures(claims.scopes);
    const readsNotifications = feederGrantReadsNotifications(claims.scopes);
    const feederCorp = await deps.lookupCorporation(claims.characterId);
    if (options.expectedFeederCorp !== undefined && feederCorp !== options.expectedFeederCorp) {
      fail('failed-precondition', 'That Character is in another corporation', 'wrong-corp');
    }

    accepted =
      input.code === RECONNECT_CODE
        ? await reconnectCore(
            bookDeps(deps),
            feederCorp,
            claims.characterId,
            callerId,
            options.reconnectOwnOf
          )
        : await acceptInviteCore(bookDeps(deps), {
            code: input.code,
            characterId: claims.characterId,
            name: claims.name,
            feederCorp,
            recordExtra: { grantHolder: claims.characterId, grantedBy: callerId },
            allowTakeBack: true,
          });
    undo = accepted.undo;
    if ('reconnect' in accepted) reconnect = accepted.reconnect as ReconnectUndo;

    const now = deps.now();
    const doc: CorpSyncGrantDoc = {
      corporationId: feederCorp,
      characterId: claims.characterId,
      characterName: claims.name,
      encryptedRefreshToken: encryptRefreshToken(
        refreshed.refreshToken,
        claims.characterId,
        deps.key(),
        PURPOSE
      ),
      clientId: claims.clientId,
      enabledAt: now,
      kind: 'feeder',
      collectorCorporationId: accepted.collectorCorporationId,
      grantedBy: callerId,
      readsStructures,
      readsNotifications,
    };
    previousGrant = (await grantRef(deps.db, feederCorp).get()).data() as
      CorpSyncGrantDoc | undefined;
    await grantRef(deps.db, feederCorp).set(doc);
    grantWritten = true;

    const first = await syncOneFeeder(deps, deps.esi, accepted.collectorCorporationId, feederCorp);
    if (first.outcome === 'stale') {
      fail(
        'permission-denied',
        'That Character cannot read the corporation ledger',
        'not-an-accountant'
      );
    }
    if (first.outcome !== 'ok') {
      fail('unavailable', 'The corporation ledger could not be read now', 'ledger-unavailable');
    }
  } catch (err) {
    if (undo && accepted) {
      await unwindAccept(
        deps,
        accepted.feederCorporationId,
        accepted.collectorCorporationId,
        undo,
        {
          characterId: callerId,
        }
      );
    }
    if (reconnect && accepted) {
      await undoReconnect(
        bookDeps(deps),
        accepted.collectorCorporationId,
        accepted.feederCorporationId,
        reconnect
      );
    }
    if (accepted && grantWritten) {
      await putBackGrant(deps, accepted.feederCorporationId, previousGrant);
    }
    await orphan();
    throw err;
  }
  if (previousGrant) await revokeStored(deps, previousGrant, refreshed.refreshToken);

  if (input.requestedRatePct !== undefined) {
    try {
      const ref = feederRef(deps.db, accepted.collectorCorporationId, accepted.feederCorporationId);
      const rec = (await ref.get()).data() as FeederRecord | undefined;
      await ref.update({
        requestedRatePct: input.requestedRatePct,
        ...(rec
          ? { ownerRateHistory: appendRequestedRate(rec, input.requestedRatePct, deps.now()) }
          : {}),
      });
    } catch (e) {
      deps.log('feeder requested rate not saved', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  await tryRebuildFeederView(
    bookDeps(deps),
    accepted.collectorCorporationId,
    accepted.feederCorporationId
  );
  return {
    collectorCorporationId: accepted.collectorCorporationId,
    feederCorporationId: accepted.feederCorporationId,
    rejoined: accepted.rejoined,
  };
}

async function putBackGrant(
  deps: CorpSyncDeps,
  feederCorp: number,
  previous: CorpSyncGrantDoc | undefined
): Promise<void> {
  const ref = grantRef(deps.db, feederCorp);
  const current = (await ref.get()).data() as CorpSyncGrantDoc | undefined;
  if (previous) await ref.set(previous);
  else if (current) {
    await ref.delete();
    deps.log('Moon owner grant dropped', { feederCorporationId: feederCorp, why: 'save refused' });
  }
  if (current && current.encryptedRefreshToken !== previous?.encryptedRefreshToken) {
    await revokeStored(deps, current);
  }
}

async function unwindAccept(
  deps: FeederGrantDeps,
  feederCorp: number,
  collector: number,
  undo: AcceptUndo,
  actor: { characterId: number }
): Promise<void> {
  const grantSnap = await grantRef(deps.db, feederCorp).get();
  const held = grantSnap.data() as CorpSyncGrantDoc | undefined;
  const recordRef = feederRef(deps.db, collector, feederCorp);
  await deps.db.runTransaction(async (tx) => {
    if (undo.priorRecord) tx.set(recordRef, undo.priorRecord);
    else tx.delete(recordRef);
    const pointerRef = deps.db.collection(FEEDER_OF_COLLECTION).doc(String(feederCorp));
    if (undo.priorPointer) tx.set(pointerRef, undo.priorPointer);
    else tx.delete(pointerRef);
    tx.update(deps.db.collection(FEEDER_INVITES_COLLECTION).doc(undo.inviteId), {
      acceptedBy: FieldValue.delete(),
      acceptedAt: FieldValue.delete(),
      acceptedByCorporationId: FieldValue.delete(),
    });
    if (held && held.kind === 'feeder') tx.delete(grantRef(deps.db, feederCorp));
    appendAudit(
      tx,
      bookDeps(deps),
      collector,
      { characterId: actor.characterId, name: 'Moon owner setup' },
      'feederJoinUndone',
      { feederCorporationId: feederCorp, inviteId: undo.inviteId }
    );
  });
  if (held && held.kind === 'feeder') {
    deps.log('Moon owner grant dropped', {
      feederCorporationId: feederCorp,
      why: 'accept unwound',
    });
    await revokeStored(deps, held);
  }
  try {
    if (undo.priorRecord) await tryRebuildFeederView(bookDeps(deps), collector, feederCorp);
    else await deps.db.recursiveDelete(feederViewRef(deps.db, collector, feederCorp));
  } catch (e) {
    deps.log('feeder view not restored', { error: e instanceof Error ? e.message : String(e) });
  }
}

export interface FeederContext {
  callerId: number;
  collectorCorporationId: number;
  record: FeederRecord;
  grant: CorpSyncGrantDoc | undefined;
}

type Standing = 'leave' | 'read' | 'view' | 'edit';

export async function authorizeFeederCaller(
  deps: CorpSyncDeps,
  caller: Caller,
  input: FeederCall,
  standing: Standing
): Promise<FeederContext | null> {
  const { characterId: callerId, claims } = await verifyCallerToken(
    { verifyToken: deps.verify },
    caller,
    input.accessToken
  );
  requireRolesScope(claims);
  const pointer = (
    await deps.db.collection(FEEDER_OF_COLLECTION).doc(String(input.corporationId)).get()
  ).data();
  const current: unknown = pointer?.collectorCorporationId;
  let collector = typeof current === 'number' ? current : undefined;
  if (standing === 'view') {
    const previous = await readPrevious(deps.db, input.corporationId);
    const wanted = input.collectorCorporationId;
    if (wanted !== undefined) {
      collector =
        wanted === collector || previous.some((e) => e.collectorCorporationId === wanted)
          ? wanted
          : undefined;
    } else if (collector === undefined) {
      collector = previous.at(-1)?.collectorCorporationId;
    }
  }
  if (collector === undefined) return null;
  const [recordSnap, grantSnap] = await Promise.all([
    feederRef(deps.db, collector, input.corporationId).get(),
    grantRef(deps.db, input.corporationId).get(),
  ]);
  const feeder = recordSnap.data() as FeederRecord | undefined;
  const grant = grantSnap.data() as CorpSyncGrantDoc | undefined;
  if (!feeder) return null;
  const isHolder =
    standing !== 'view' &&
    standing !== 'edit' &&
    (callerId === feeder.grantHolder ||
      callerId === feeder.grantedBy ||
      callerId === grant?.characterId ||
      callerId === grant?.grantedBy);
  await requireLiveRoles(
    deps,
    { characterId: callerId, claims, accessToken: input.accessToken },
    {
      corporationId: input.corporationId,
      wrongCorp: 'not-your-feeder',
      need: (roles) =>
        isHolder ||
        (standing === 'leave'
          ? roles.isDirector
          : standing === 'read'
            ? roles.canView
            : roles.canEdit),
      denied: { message: 'Not allowed for this corporation', reason: 'not-your-feeder' },
    }
  );
  return { callerId, collectorCorporationId: collector, record: feeder, grant };
}

export const LEAVABLE: readonly FeederRecord['status'][] = [
  'active',
  'pending-removal',
  'disconnected',
];

export async function leaveFeeder(
  deps: CorpSyncDeps,
  caller: Caller,
  input: FeederCall
): Promise<{ left: true; owedIsk: number | null }> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'leave');
  if (!ctx || !LEAVABLE.includes(ctx.record.status)) {
    fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
  }
  await endFeeder(deps, {
    collectorCorporationId: ctx.collectorCorporationId,
    feederCorporationId: input.corporationId,
    effectiveAt: deps.now(),
    finalStatus: ctx.record.status === 'pending-removal' ? 'removed' : 'left',
    actor: { characterId: ctx.callerId, name: 'Moon owner' },
    action: ctx.record.status === 'pending-removal' ? 'feederRemovalForced' : 'feederLeft',
    allowed: LEAVABLE,
  });
  return { left: true, owedIsk: null };
}

export interface EndFeederInput {
  collectorCorporationId: number;
  feederCorporationId: number;
  effectiveAt: number;
  finalStatus: 'left' | 'removed';
  actor: { characterId: number | null; name: string; via?: string };
  action: AuditAction;
  allowed: readonly FeederRecord['status'][];
  rebuildView?: boolean;
  guard?: (rec: FeederRecord) => boolean;
  finalRead?: boolean;
}

async function finalLedgerRead(
  deps: CorpSyncDeps,
  collector: number,
  feederCorp: number
): Promise<void> {
  if (!deps.esi) return;
  try {
    await syncOneFeeder(deps, deps.esi, collector, feederCorp);
  } catch (err) {
    deps.log('Final moon owner ledger read failed', {
      feederCorporationId: feederCorp,
      collectorCorporationId: collector,
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
}

export async function endFeeder(deps: CorpSyncDeps, input: EndFeederInput): Promise<void> {
  const { collectorCorporationId: collector, feederCorporationId: feederCorp } = input;
  const recordRef = feederRef(deps.db, collector, feederCorp);
  const pointerRef = deps.db.collection(FEEDER_OF_COLLECTION).doc(String(feederCorp));
  const previousRef = deps.db.collection(FEEDER_PREVIOUS_COLLECTION).doc(String(feederCorp));
  const gRef = grantRef(deps.db, feederCorp);
  if (input.finalRead !== false) await finalLedgerRead(deps, collector, feederCorp);
  const now = deps.now();

  const dropped = await deps.db.runTransaction(async (tx) => {
    const [recSnap, ptrSnap, grantSnap, prevSnap] = await Promise.all([
      tx.get(recordRef),
      tx.get(pointerRef),
      tx.get(gRef),
      tx.get(previousRef),
    ]);
    const rec = recSnap.data() as FeederRecord | undefined;
    if (
      !rec ||
      !ptrSnap.exists ||
      !input.allowed.includes(rec.status) ||
      (input.guard && !input.guard(rec))
    ) {
      fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
    }
    const grant = grantSnap.data() as CorpSyncGrantDoc | undefined;
    tx.update(recordRef, {
      status: input.finalStatus,
      leftAt: now,
      coveragePeriods: closePeriod(rec.coveragePeriods, utcDay(input.effectiveAt)),
      removal: FieldValue.delete(),
      removalLinkId: FieldValue.delete(),
      staleSince: FieldValue.delete(),
      staleReason: FieldValue.delete(),
      disconnectedAt: FieldValue.delete(),
      lastSyncResult: FieldValue.delete(),
      viewDismissedAt: FieldValue.delete(),
      grantHolder: FieldValue.delete(),
      grantedBy: FieldValue.delete(),
    });
    if (rec.removalLinkId) {
      tx.delete(deps.db.collection(REMOVAL_LINKS_COLLECTION).doc(rec.removalLinkId));
    }
    tx.delete(pointerRef);
    tx.set(previousRef, {
      collectorCorporationId: collector,
      leftAt: now,
      history: withPreviousCollector(previousCollectors(prevSnap.data()), {
        collectorCorporationId: collector,
        leftAt: now,
      }),
    });
    if (grant?.kind === 'feeder') tx.delete(gRef);
    appendAudit(tx, bookDeps(deps), collector, input.actor, input.action, {
      feederCorporationId: feederCorp,
    });
    return grant?.kind === 'feeder' ? grant : undefined;
  });
  if (dropped) {
    deps.log('Moon owner grant dropped', {
      feederCorporationId: feederCorp,
      why: 'feed ended',
      action: input.action,
    });
    await revokeStored(deps, dropped);
  }
  if (input.rebuildView !== false) {
    await tryRebuildFeederView(bookDeps(deps), collector, feederCorp);
    await refreshSharedPops(bookDeps(deps), collector);
  }
}

const ENDABLE: readonly FeederRecord['status'][] = ['active', 'pending-removal', 'disconnected'];

export async function dropBookGrants(deps: CorpSyncDeps, collector: number): Promise<void> {
  const pointers = await deps.db
    .collection(FEEDER_OF_COLLECTION)
    .where('collectorCorporationId', '==', collector)
    .get();
  for (const doc of pointers.docs) {
    try {
      await endFeeder(deps, {
        collectorCorporationId: collector,
        feederCorporationId: Number(doc.id),
        effectiveAt: deps.now(),
        finalStatus: 'removed',
        actor: { characterId: null, name: 'Book deleted' },
        action: 'feederRemovedBookDeleted',
        allowed: ENDABLE,
        rebuildView: false,
        finalRead: false,
      });
    } catch (err) {
      if (!(err instanceof HttpsError && err.code === 'failed-precondition')) throw err;
    }
  }
  await dropCorpSyncGrant(deps, collector);
}

export interface FeederRefinery {
  structureId: number;
  label: string | null;
  volume: number;
}

export type FeederStatusResult =
  | { status: 'none'; ownBookFrom?: string; previousCollectorIds?: number[] }
  | {
      status: 'feeder';
      collectorCorporationId: number;
      collectorName: string | null;
      feederStatus: FeederRecord['status'];
      lastReadWellAt: number | null;
      lastSyncResult: string | null;
      requestedRatePct: number | null;
      effectiveRatePct: number | null;
      isHolder: boolean;
      refineries: FeederRefinery[];
      owedIsk: number | null;
      previousCollectorIds: number[];
    };

export function aggregateRefineries(
  rows: readonly { structureId: number; date: string; quantity: number }[],
  periods: FeederRecord['coveragePeriods']
): FeederRefinery[] {
  const byStructure = new Map<number, number>();
  for (const r of rows) {
    if (!isDayCovered(periods, r.date)) continue;
    byStructure.set(r.structureId, (byStructure.get(r.structureId) ?? 0) + r.quantity);
  }
  return [...byStructure]
    .map(([structureId, volume]) => ({ structureId, label: null, volume }))
    .sort((a, b) => b.volume - a.volume || a.structureId - b.structureId);
}

async function notFeeding(
  deps: CorpSyncDeps,
  caller: Caller,
  input: FeederCall
): Promise<FeederStatusResult> {
  const floor = await ownBookFloor((ref) => ref.get(), deps.db, input.corporationId);
  if (floor === null) return { status: 'none' };
  const identity = await deps
    .readIdentity(signedInCharacter(caller), input.accessToken)
    .catch(() => null);
  if (identity?.corporationId !== input.corporationId) return { status: 'none' };
  const previous = previousIds(await readPrevious(deps.db, input.corporationId));
  return { status: 'none', ownBookFrom: floor, previousCollectorIds: previous };
}

export async function getFeederStatus(
  deps: CorpSyncDeps,
  caller: Caller,
  input: FeederCall
): Promise<FeederStatusResult> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'read');
  if (!ctx) return notFeeding(deps, caller, input);
  const { record: rec, collectorCorporationId: collector } = ctx;
  const [book, rows, previous] = await Promise.all([
    bookRef(deps.db, collector).get(),
    readFeederRows(deps.db, bookRef(deps.db, collector), input.corporationId),
    readPrevious(deps.db, input.corporationId),
  ]);
  const name = book.get('corporationName');
  const effective = effectiveOwnerRatePct(deriveOwnerRateHistory(rec), utcDay(deps.now())) ?? null;
  const last = rec.lastSyncResult;
  return {
    status: 'feeder',
    collectorCorporationId: collector,
    collectorName: typeof name === 'string' ? name : null,
    feederStatus: rec.status,
    lastReadWellAt: rec.lastReadWellAt ?? null,
    lastSyncResult: last ? (last.reason ? `${last.outcome}:${last.reason}` : last.outcome) : null,
    requestedRatePct: rec.requestedRatePct ?? null,
    effectiveRatePct: effective,
    isHolder:
      ctx.callerId === rec.grantHolder ||
      ctx.callerId === rec.grantedBy ||
      ctx.callerId === ctx.grant?.characterId ||
      ctx.callerId === ctx.grant?.grantedBy,
    refineries: aggregateRefineries(rows, rec.coveragePeriods),
    owedIsk: null,
    previousCollectorIds: previousIds(previous, collector),
  };
}
