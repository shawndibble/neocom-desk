import { runPool } from './asyncPool.js';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { SsoRefreshError, type RefreshedTokens } from './alertGrant.js';
import { decryptRefreshToken, encryptRefreshToken, rotateStoredToken } from './alertGrantCrypto.js';
import { boundedString, record } from './communities.js';
import { CORP_SYNC_SCOPES } from './corpSyncScopes.js';
import { BOOK_SYNC_CRON } from './corpTaxBookSchedule.js';
import {
  FEEDER_OF_COLLECTION,
  META,
  SCHEDULED_SYNC_DOC,
  decideRoles,
  parseBookCall,
  OFFICERS,
  type OfficerAccess,
} from './corpTaxBook.js';
import {
  SCHEDULED_VIA,
  appendAudit,
  authorizeOfficer,
  bookRef,
  feederRef,
  type Actor,
  type BookDeps,
  type OpenPricesReader,
  mergeObservedInto,
} from './corpTaxBookStore.js';
import { tryRebuildFeederView } from './corpTaxBookFeederView.js';
import {
  FeederStorm,
  READABLE_FEEDER_STATUSES,
  readableFeeders,
  outcomeOf,
  readFeederLedger,
  recordFeederRead,
  refreshFeederExtractions,
  refreshRefineryStructures,
  type FeederReadRecord,
} from './corpTaxBookFeederSync.js';
import type { FeederRecord } from './corpTaxBookFeeders.js';
import { runBookSync, type BookSyncResult, type StopReason } from './corpTaxBookScheduledSync.js';
import type { SyncEsi } from './corpTaxBookSyncEsi.js';
import type { IdentityReader } from './corpTaxBookEsi.js';
import {
  assertOwnToken,
  requireLiveRoles,
  signedInCharacter,
  verifyAccessToken,
  fail,
  type Caller,
} from './actorAuth.js';
import type { EveTokenClaims } from './verifyEveToken.js';
import type { PushSender } from './projectionStore.js';
import { deliverServerEvent } from './serverEventStore.js';
import {
  SYNC_STOPPED_NOTIFY_BUDGET_MS,
  isAlertedStop,
  syncStoppedFires,
  syncStoppedRecipients,
} from './corpSyncStoppedAlert.js';
import type { CorporationAllianceLookup } from './sharedPopsEsi.js';
import { learnOwnRefineryNames, stampFailedRoleCheck } from './sharedPopsStore.js';
import { DAY_MS, HOUR_MS } from './timeConstants.js';

export const CORP_SYNC_GRANTS_COLLECTION = 'corpTaxBookSyncGrants';
export { SCHEDULED_SYNC_DOC };

export { CORP_SYNC_SCOPES };

export interface CorpSyncGrantDoc {
  corporationId: number;
  characterId: number;
  characterName: string;
  encryptedRefreshToken: string;
  clientId: string;
  enabledAt: number;
  kind?: 'book' | 'feeder';
  grantedBy?: number;
  collectorCorporationId?: number;
  readsStructures?: boolean;
  readsNotifications?: boolean;
  nextSyncAt?: number;
}

export interface ScheduledSyncStatus {
  status: 'active' | 'stopped';
  characterId: number;
  characterName: string;
  enabledAt: number;
  stoppedAt?: number;
  stoppedReason?: StopReason;
  lastRun?: {
    at: number;
    outcome: 'synced' | 'skipped';
    reason?: string;
    observedRows?: number;
    extractions?: number;
    donationsAdded?: number;
    settled?: number;
    missing?: string[];
  };
  systemIds?: Record<string, number>;
}

export interface CorpSyncDeps {
  db: Firestore;
  now: () => number;
  key: () => Buffer;
  verify: (accessToken: string) => Promise<EveTokenClaims>;
  refresh: (clientId: string, refreshToken: string) => Promise<RefreshedTokens>;
  revoke: (clientId: string, refreshToken: string) => Promise<void>;
  readIdentity: IdentityReader;
  openPrices?: OpenPricesReader;
  corporationAlliance?: CorporationAllianceLookup;
  esi?: SyncEsi;
  invalidGrantRecheckMs?: number;
  log: (message: string, data?: Record<string, unknown>) => void;
  push?: PushSender;
  notifyBudgetMs?: number;
}

const PURPOSE = 'corpSyncGrant' as const;

export const grantRef = (db: Firestore, corporationId: number) =>
  db.collection(CORP_SYNC_GRANTS_COLLECTION).doc(String(corporationId));
const statusRef = (db: Firestore, corporationId: number) =>
  bookRef(db, corporationId).collection(META).doc(SCHEDULED_SYNC_DOC);

const bookDeps = (deps: CorpSyncDeps): BookDeps => ({
  db: deps.db,
  now: deps.now,
  verifyToken: deps.verify,
  readIdentity: deps.readIdentity,
  ...(deps.openPrices ? { openPrices: deps.openPrices } : {}),
  ...(deps.corporationAlliance ? { corporationAlliance: deps.corporationAlliance } : {}),
});

function sameScopes(scopes: readonly string[]): boolean {
  return (
    scopes.length === CORP_SYNC_SCOPES.length && CORP_SYNC_SCOPES.every((s) => scopes.includes(s))
  );
}

export interface SaveCorpSyncGrantInput {
  corporationId: number;
  accessToken: string;
  refreshToken: string;
}

export function parseSaveCorpSyncGrantInput(data: unknown): SaveCorpSyncGrantInput {
  const d = record(data);
  return {
    corporationId: parseBookCall(data).corporationId,
    accessToken: boundedString(d.accessToken, 'accessToken', 8192),
    refreshToken: boundedString(d.refreshToken, 'refreshToken', 8192),
  };
}

export async function saveCorpSyncGrant(
  deps: CorpSyncDeps,
  caller: Caller,
  input: SaveCorpSyncGrantInput
): Promise<{ corporationId: number; characterId: number; enabledAt: number }> {
  const callerId = signedInCharacter(caller);

  const supplied = await verifyGrantToken(deps, input.accessToken);
  assertOwnToken(caller, callerId, supplied);

  let refreshed: RefreshedTokens;
  try {
    refreshed = await deps.refresh(supplied.clientId, input.refreshToken);
  } catch (err) {
    deps.log('Corp sync grant refresh token rejected', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    throw new HttpsError('unauthenticated', 'EVE refresh token rejected');
  }
  const claims = await verifyGrantToken(deps, refreshed.accessToken);
  if (claims.characterId !== supplied.characterId) {
    fail('permission-denied', 'Refresh token belongs to another Character', 'token-mismatch');
  }

  await requireLiveRoles(
    deps,
    { characterId: claims.characterId, claims, accessToken: refreshed.accessToken },
    {
      corporationId: input.corporationId,
      need: 'canEdit',
      denied: {
        message: 'Only a CEO, Director or Accountant can turn this on',
        reason: 'not-an-editor',
      },
    }
  );
  const book = await bookRef(deps.db, input.corporationId).get();
  if (!book.exists || book.get('active') !== true) {
    fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
  }

  const now = deps.now();
  const doc: CorpSyncGrantDoc = {
    corporationId: input.corporationId,
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
    nextSyncAt: now,
  };
  const previous = await deps.db.runTransaction(async (tx) => {
    const ref = grantRef(deps.db, input.corporationId);
    const held = (await tx.get(ref)).data() as CorpSyncGrantDoc | undefined;
    if (held?.kind === 'feeder') {
      fail('failed-precondition', 'This corporation feeds another book', 'feeder-grant-exists');
    }
    const status = statusRef(deps.db, input.corporationId);
    const hadSystemIds = (await tx.get(status)).data()?.systemIds as
      Record<string, number> | undefined;
    tx.set(ref, doc);
    const next: ScheduledSyncStatus = {
      status: 'active',
      characterId: doc.characterId,
      characterName: doc.characterName,
      enabledAt: now,
      ...(hadSystemIds ? { systemIds: hadSystemIds } : {}),
    };
    tx.set(status, next);
    appendAudit(
      tx,
      bookDeps(deps),
      input.corporationId,
      { characterId: doc.characterId, name: doc.characterName },
      'scheduledSyncOn',
      held && held.characterId !== doc.characterId
        ? { replacedCharacterId: held.characterId, replacedName: held.characterName }
        : { replacedCharacterId: null }
    );
    return held;
  });

  if (previous) {
    await revokeStored(deps, previous, refreshed.refreshToken);
  }
  return { corporationId: input.corporationId, characterId: doc.characterId, enabledAt: now };
}

async function verifyGrantToken(deps: CorpSyncDeps, accessToken: string): Promise<EveTokenClaims> {
  const claims = await verifyAccessToken(deps.verify, accessToken, {
    onReject: (err) =>
      deps.log('Corp sync grant access token rejected', {
        error: err instanceof Error ? err.message : 'unknown',
      }),
  });
  if (!sameScopes(claims.scopes)) {
    fail(
      'permission-denied',
      'Token must carry exactly the Corp Tax Book sync scopes',
      'wrong-scopes'
    );
  }
  return claims;
}

export async function revokeStored(
  deps: CorpSyncDeps,
  doc: CorpSyncGrantDoc,
  keepToken?: string
): Promise<boolean> {
  try {
    const token = decryptRefreshToken(
      doc.encryptedRefreshToken,
      doc.characterId,
      deps.key(),
      PURPOSE
    );
    if (token === keepToken) return true;
    await deps.revoke(doc.clientId, token);
    return true;
  } catch (err) {
    deps.log('Corp sync grant token revoke failed', {
      corporationId: doc.corporationId,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return false;
  }
}

export async function revokeCorpSyncGrant(
  deps: CorpSyncDeps,
  caller: Caller,
  call: { corporationId: number; accessToken?: string }
): Promise<{ deleted: boolean; revoked: boolean }> {
  const callerId = signedInCharacter(caller);
  const grant = (await grantRef(deps.db, call.corporationId).get()).data() as
    CorpSyncGrantDoc | undefined;
  if (!grant) return { deleted: false, revoked: false };

  let actor: Actor;
  let by: 'holder' | 'ceo';
  if (grant.characterId === callerId) {
    actor = { characterId: callerId, name: grant.characterName };
    by = 'holder';
  } else {
    const access = await authorizeOfficer(bookDeps(deps), caller, call, 'ceo', { live: true });
    actor = { characterId: access.characterId, name: access.characterName };
    by = 'ceo';
  }

  const deleted = await removeGrant(deps, grant, actor, {
    by,
    holderCharacterId: grant.characterId,
    holderName: grant.characterName,
  });
  if (!deleted) return { deleted: false, revoked: false };
  return { deleted: true, revoked: await revokeStored(deps, grant) };
}

async function removeGrant(
  deps: CorpSyncDeps,
  grant: CorpSyncGrantDoc,
  actor: Actor,
  detail: Record<string, unknown>
): Promise<boolean> {
  return deps.db.runTransaction(async (tx) => {
    const ref = grantRef(deps.db, grant.corporationId);
    const held = (await tx.get(ref)).data() as CorpSyncGrantDoc | undefined;
    if (!held || held.encryptedRefreshToken !== grant.encryptedRefreshToken) return false;
    tx.delete(ref);
    tx.delete(statusRef(deps.db, grant.corporationId));
    appendAudit(tx, bookDeps(deps), grant.corporationId, actor, 'scheduledSyncOff', detail);
    return true;
  });
}

export async function dropCorpSyncGrant(deps: CorpSyncDeps, corporationId: number): Promise<void> {
  const grant = (await grantRef(deps.db, corporationId).get()).data() as
    CorpSyncGrantDoc | undefined;
  if (!grant) return;
  await grantRef(deps.db, corporationId).delete();
  deps.log('Corp sync grant dropped', {
    corporationId,
    kind: grant.kind ?? 'book',
    why: 'book deleted',
  });
  await revokeStored(deps, grant);
}

export async function deleteCorpSyncGrantsHeldBy(
  deps: CorpSyncDeps,
  characterId: number
): Promise<number> {
  const snap = await deps.db
    .collection(CORP_SYNC_GRANTS_COLLECTION)
    .where('characterId', '==', characterId)
    .get();
  let count = 0;
  for (const doc of snap.docs) {
    const grant = doc.data() as CorpSyncGrantDoc;
    if (grant.kind === 'feeder') {
      await doc.ref.delete();
      deps.log('Moon owner grant dropped', {
        feederCorporationId: grant.corporationId,
        why: 'holder account purged',
      });
      await revokeStored(deps, grant);
      count += 1;
      continue;
    }
    const removed = await removeGrant(
      deps,
      grant,
      { characterId: grant.characterId, name: grant.characterName, via: 'account purge' },
      { by: 'purge', holderCharacterId: grant.characterId, holderName: grant.characterName }
    );
    if (removed) {
      await revokeStored(deps, grant);
      count += 1;
    }
  }
  return count;
}

export interface RunSummary {
  grants: number;
  synced: number;
  skipped: number;
  stopped: number;
  budgetStopped: boolean;
  feeders: { read: number; stale: number; skipped: number; disconnected: number };
}

export interface FeederRunOptions {
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export const FEEDER_GAP_MS = 1500;

export const BOOK_SYNC_CONCURRENCY = 3;

export async function runScheduledCorpSyncs(
  deps: CorpSyncDeps,
  esi: SyncEsi,
  feederOptions: FeederRunOptions = {}
): Promise<RunSummary> {
  const summary: RunSummary = {
    grants: 0,
    synced: 0,
    skipped: 0,
    stopped: 0,
    budgetStopped: false,
    feeders: { read: 0, stale: 0, skipped: 0, disconnected: 0 },
  };
  const due = await dueGrants(deps);
  summary.grants = due.length;
  let started = 0;
  const books = runPool(
    due,
    BOOK_SYNC_CONCURRENCY,
    async (grant) => {
      started += 1;
      await syncDueBook(deps, esi, grant, summary);
    },
    () => {
      if (esi.budgetLow()) summary.budgetStopped = true;
      return summary.budgetStopped;
    }
  );
  await Promise.all([books, runFeederSyncs(deps, esi, summary, feederOptions)]);
  summary.skipped += due.length - started;
  return summary;
}

async function syncDueBook(
  deps: CorpSyncDeps,
  esi: SyncEsi,
  grant: CorpSyncGrantDoc,
  summary: RunSummary
): Promise<void> {
  try {
    const result = await runOne(deps, esi, grant);
    if (result.kind === 'synced') {
      summary.synced += 1;
      await deferNextSync(deps, grant).catch((err) =>
        deps.log('Could not rest a synced book grant', {
          corporationId: grant.corporationId,
          error: err instanceof Error ? err.name : 'unknown',
        })
      );
    } else if (result.kind === 'stopped') summary.stopped += 1;
    else {
      summary.skipped += 1;
      if (result.reason === 'esi-budget') summary.budgetStopped = true;
    }
  } catch (err) {
    summary.skipped += 1;
    deps.log('Scheduled Corp Tax Book sync failed', {
      corporationId: grant.corporationId,
      error: err instanceof Error ? err.name : 'unknown',
      ...(err instanceof HttpsError ? { code: err.code } : {}),
    });
  }
}

export const SYNC_CORP_TAX_BOOKS_SCHEDULE = {
  schedule: BOOK_SYNC_CRON,
  timeZone: 'UTC',
} as const;

export const SYNC_REST_MS = HOUR_MS;

const GRANT_BACKFILL_DOC = 'corpTaxBookSyncGrantMeta/nextSyncAtBackfill';

const GRANT_BACKFILL_EVERY_MS = 7 * DAY_MS;

async function dueGrants(deps: CorpSyncDeps): Promise<CorpSyncGrantDoc[]> {
  const marker = deps.db.doc(GRANT_BACKFILL_DOC);
  const last = (await marker.get()).get('doneAt');
  if (typeof last !== 'number' || deps.now() - last >= GRANT_BACKFILL_EVERY_MS) {
    const all = await deps.db.collection(CORP_SYNC_GRANTS_COLLECTION).get();
    let missing = 0;
    for (const doc of all.docs) {
      const held = doc.data() as CorpSyncGrantDoc;
      if (held.kind === 'feeder' || held.nextSyncAt !== undefined) continue;
      try {
        await doc.ref.update({ nextSyncAt: 0 });
        missing += 1;
      } catch (err) {
        if ((err as { code?: unknown }).code !== 5) throw err;
      }
    }
    await marker.set({ doneAt: deps.now(), backfilled: missing });
  }
  const snap = await deps.db
    .collection(CORP_SYNC_GRANTS_COLLECTION)
    .where('nextSyncAt', '<=', deps.now())
    .get();
  return snap.docs.map((d) => d.data() as CorpSyncGrantDoc);
}

async function deferNextSync(deps: CorpSyncDeps, grant: CorpSyncGrantDoc): Promise<void> {
  const ref = grantRef(deps.db, grant.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const held = (await tx.get(ref)).data() as CorpSyncGrantDoc | undefined;
    if (!held || held.enabledAt !== grant.enabledAt) return;
    tx.update(ref, { nextSyncAt: deps.now() + SYNC_REST_MS });
  });
}

async function runFeederSyncs(
  deps: CorpSyncDeps,
  esi: SyncEsi,
  summary: RunSummary,
  options: FeederRunOptions
): Promise<void> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const storm = new FeederStorm();
  let first = true;
  for (const {
    feederCorporationId,
    collectorCorporationId,
    record: queried,
  } of await readableFeeders(deps.db, FEEDER_OF_COLLECTION, deps.log)) {
    try {
      const record =
        queried ??
        ((await feederRef(deps.db, collectorCorporationId, feederCorporationId).get()).data() as
          FeederRecord | undefined);
      if (!record || !READABLE_FEEDER_STATUSES.includes(record.status)) continue;
      if (!first) await sleep(options.gapMs ?? FEEDER_GAP_MS);
      first = false;
      const budgetOut = summary.budgetStopped || esi.budgetLow();
      const result = await syncOneFeeder(
        deps,
        esi,
        collectorCorporationId,
        feederCorporationId,
        storm,
        budgetOut
      );
      if (result.status === 'disconnected') summary.feeders.disconnected += 1;
      if (result.outcome === 'ok') summary.feeders.read += 1;
      else if (result.outcome === 'stale') summary.feeders.stale += 1;
      else summary.feeders.skipped += 1;
      if (result.budget) summary.budgetStopped = true;
    } catch (err) {
      summary.feeders.skipped += 1;
      deps.log('Scheduled feeder sync failed', {
        feederCorporationId,
        collectorCorporationId,
        error: err instanceof Error ? err.name : 'unknown',
        ...(err instanceof HttpsError ? { code: err.code } : {}),
      });
    }
  }
}

interface FeederRunResult {
  outcome: 'ok' | 'stale' | 'none';
  status: 'active' | 'disconnected' | null;
  budget: boolean;
}

export async function syncOneFeeder(
  deps: CorpSyncDeps,
  esi: SyncEsi,
  collectorCorporationId: number,
  feederCorporationId: number,
  storm: FeederStorm = new FeederStorm(),
  skipEsi = false
): Promise<FeederRunResult> {
  const finish = async (
    read: FeederReadRecord,
    budget = false,
    grant?: CorpSyncGrantDoc
  ): Promise<FeederRunResult> => {
    const recorded = await recordFeederRead(
      bookDeps(deps),
      collectorCorporationId,
      feederCorporationId,
      read
    );
    if (recorded?.viewChanged) {
      await tryRebuildFeederView(bookDeps(deps), collectorCorporationId, feederCorporationId);
    }
    const status = recorded?.status ?? null;
    if (status === 'disconnected' && grant)
      await dropFeederGrant(deps, grant, 'disconnected after 30 days');
    return { outcome: read.outcome, status, budget };
  };

  const grantSnap = await grantRef(deps.db, feederCorporationId).get();
  const grant = grantSnap.data() as CorpSyncGrantDoc | undefined;
  if (!grant || grant.kind !== 'feeder') {
    deps.log('Moon owner has no feeder grant', {
      feederCorporationId,
      collectorCorporationId,
      held: grant ? (grant.kind ?? 'book') : 'none',
    });
    return finish({ outcome: 'stale', reason: 'no-grant' });
  }
  if (skipEsi || storm.tripped) {
    return finish(
      { outcome: 'none', reason: skipEsi ? 'esi-budget' : 'esi-backoff' },
      skipEsi,
      grant
    );
  }

  const refreshed = await refreshGrant(deps, grant);
  if (refreshed.kind === 'skip') {
    return finish({ outcome: 'none', reason: 'esi-unavailable' }, false, grant);
  }
  if (refreshed.kind === 'dead' || refreshed.kind === 'unreadable') {
    await dropFeederGrant(
      deps,
      refreshed.grant,
      refreshed.kind === 'dead' ? 'SSO refused the token' : 'stored token unreadable',
      false
    );
    return finish({
      outcome: 'stale',
      reason: refreshed.kind === 'dead' ? 'token-revoked' : 'grant-unreadable',
    });
  }

  const live = refreshed.grant;
  const read = await readFeederLedger(esi, feederCorporationId, refreshed.accessToken);
  const outcome = outcomeOf(read);
  storm.record(outcome);
  if (read.kind === 'refused') return finish({ outcome, reason: 'esi-refused' }, false, live);
  if (read.kind === 'budget') return finish({ outcome, reason: 'esi-budget' }, true, live);
  if (read.kind === 'unavailable') {
    return finish({ outcome, reason: 'esi-unavailable' }, false, live);
  }

  const latest = (await grantRef(deps.db, feederCorporationId).get()).data() as
    CorpSyncGrantDoc | undefined;
  const feederNow = (
    await feederRef(deps.db, collectorCorporationId, feederCorporationId).get()
  ).data() as FeederRecord | undefined;
  if (
    latest?.encryptedRefreshToken !== live.encryptedRefreshToken ||
    !feederNow ||
    !READABLE_FEEDER_STATUSES.includes(feederNow.status)
  ) {
    return finish({ outcome: 'none', reason: 'esi-unavailable' }, false, live);
  }
  let extractionRefineries: number[] = [];
  try {
    extractionRefineries = await refreshFeederExtractions(
      bookDeps(deps),
      esi,
      collectorCorporationId,
      feederNow,
      refreshed.accessToken,
      live.readsNotifications === true ? live.characterId : undefined
    );
  } catch (err) {
    deps.log('Moon owner extractions read failed', {
      feederCorporationId,
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
  await mergeObservedInto(bookDeps(deps), collectorCorporationId, read.rows);
  try {
    await refreshRefineryStructures(
      bookDeps(deps),
      esi,
      collectorCorporationId,
      feederCorporationId,
      [...read.rows.map((r) => r.structureId), ...extractionRefineries],
      refreshed.accessToken,
      {
        readsStructures: live.readsStructures === true,
        readsNotifications: live.readsNotifications === true,
      }
    );
  } catch (err) {
    deps.log('Refinery structure lookup failed', {
      feederCorporationId,
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
  return finish({ outcome, refineries: read.refineries }, false, live);
}

async function dropFeederGrant(
  deps: CorpSyncDeps,
  grant: CorpSyncGrantDoc,
  why: string,
  revoke = true
): Promise<void> {
  const removed = await deps.db.runTransaction(async (tx) => {
    const ref = grantRef(deps.db, grant.corporationId);
    const held = (await tx.get(ref)).data() as CorpSyncGrantDoc | undefined;
    if (!held || held.encryptedRefreshToken !== grant.encryptedRefreshToken) return false;
    tx.delete(ref);
    return true;
  });
  if (removed)
    deps.log('Moon owner grant dropped', { feederCorporationId: grant.corporationId, why });
  if (removed && revoke) await revokeStored(deps, grant);
}

const RECHECK_LOOKS = 3;

type RefreshOutcome =
  | { kind: 'ok'; accessToken: string; grant: CorpSyncGrantDoc }
  | { kind: 'dead'; grant: CorpSyncGrantDoc }
  | { kind: 'unreadable'; grant: CorpSyncGrantDoc }
  | { kind: 'skip' };

async function refreshGrant(
  deps: CorpSyncDeps,
  grant: CorpSyncGrantDoc,
  rechecked = false
): Promise<RefreshOutcome> {
  const key = deps.key();
  let current: string;
  try {
    current = decryptRefreshToken(grant.encryptedRefreshToken, grant.characterId, key, PURPOSE);
  } catch {
    return { kind: 'unreadable', grant };
  }
  let tokens: RefreshedTokens;
  try {
    tokens = await deps.refresh(grant.clientId, current);
  } catch (err) {
    if (err instanceof SsoRefreshError && err.invalidGrant) {
      if (!rechecked) {
        for (let look = 0; look < RECHECK_LOOKS; look += 1) {
          await new Promise((resolve) => setTimeout(resolve, deps.invalidGrantRecheckMs ?? 1000));
          const latest = (await grantRef(deps.db, grant.corporationId).get()).data() as
            CorpSyncGrantDoc | undefined;
          if (!latest) break;
          if (latest.encryptedRefreshToken !== grant.encryptedRefreshToken) {
            deps.log('SSO refusal followed a rotation: retrying with the newer token', {
              corporationId: grant.corporationId,
              kind: grant.kind ?? 'book',
            });
            return refreshGrant(deps, latest, true);
          }
        }
      }
      deps.log('SSO refused a stored token', {
        corporationId: grant.corporationId,
        kind: grant.kind ?? 'book',
        ssoStatus: err.status,
        ...(err.description !== undefined ? { ssoDescription: err.description } : {}),
      });
      return { kind: 'dead', grant };
    }
    throw err;
  }
  const rotated = rotateStoredToken(
    grant.encryptedRefreshToken,
    tokens.refreshToken,
    grant.characterId,
    key,
    PURPOSE
  );
  if (rotated === null) return { kind: 'ok', accessToken: tokens.accessToken, grant };
  const written = await deps.db.runTransaction(async (tx) => {
    const ref = grantRef(deps.db, grant.corporationId);
    const latest = (await tx.get(ref)).data() as CorpSyncGrantDoc | undefined;
    if (latest?.encryptedRefreshToken !== grant.encryptedRefreshToken) return latest ?? null;
    tx.update(ref, { encryptedRefreshToken: rotated });
    return true;
  });
  if (written !== true) {
    await revokeUnlessHeld(deps, grant, tokens.refreshToken, written ?? undefined);
    return { kind: 'skip' };
  }
  return {
    kind: 'ok',
    accessToken: tokens.accessToken,
    grant: { ...grant, encryptedRefreshToken: rotated },
  };
}

async function revokeUnlessHeld(
  deps: CorpSyncDeps,
  grant: CorpSyncGrantDoc,
  token: string,
  held: CorpSyncGrantDoc | undefined
): Promise<void> {
  if (held) {
    try {
      const stored = decryptRefreshToken(
        held.encryptedRefreshToken,
        held.characterId,
        deps.key(),
        PURPOSE
      );
      if (stored === token) return;
    } catch {}
  }
  try {
    await deps.revoke(grant.clientId, token);
  } catch (err) {
    deps.log('Corp sync grant token revoke failed', {
      corporationId: grant.corporationId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

async function runOne(
  deps: CorpSyncDeps,
  esi: SyncEsi,
  initial: CorpSyncGrantDoc
): Promise<BookSyncResult> {
  const refreshed = await refreshGrant(deps, initial);
  if (refreshed.kind === 'skip') return { kind: 'skipped', reason: 'esi-unavailable' };
  if (refreshed.kind === 'dead') return stopGrant(deps, refreshed.grant, 'token-revoked');
  if (refreshed.kind === 'unreadable') return stopGrant(deps, refreshed.grant, 'grant-unreadable');
  const { accessToken, grant } = refreshed;

  const claims = await deps.verify(accessToken);

  let identity;
  try {
    identity = await deps.readIdentity(grant.characterId, accessToken);
  } catch (err) {
    const reason =
      err instanceof HttpsError ? (err.details as { reason?: string })?.reason : undefined;
    if (reason === 'esi-forbidden') return stopGrant(deps, grant, 'esi-refused');
    if (reason === 'esi-backoff') return { kind: 'skipped', reason: 'esi-budget' };
    return { kind: 'skipped', reason: 'esi-unavailable' };
  }
  if (identity.corporationId !== grant.corporationId) return stopGrant(deps, grant, 'left-corp');
  const roles = decideRoles(identity.roles, identity.ceoId === grant.characterId);
  if (!roles.canEdit) {
    await stampFailedRoleCheck(deps.db, grant.corporationId, grant.characterId, deps.now());
    return stopGrant(deps, grant, 'role-lost');
  }

  const now = deps.now();
  const access: OfficerAccess = {
    ...roles,
    characterId: grant.characterId,
    characterName: grant.characterName,
    ownerHash: claims.ownerHash,
    corporationId: grant.corporationId,
    roles: identity.roles,
    checkedAt: now,
    expiresAt: now,
  };
  const status = (await statusRef(deps.db, grant.corporationId).get()).data() as
    ScheduledSyncStatus | undefined;
  const systemHints = Object.fromEntries(
    Object.entries(status?.systemIds ?? {}).map(([k, v]) => [Number(k), v])
  );

  await learnOwnRefineryNames(bookDeps(deps), grant.corporationId, (id) =>
    esi.structure(id, accessToken)
  );
  const result = await runBookSync({
    deps: bookDeps(deps),
    esi,
    access,
    accessToken,
    corporationId: grant.corporationId,
    systemHints,
    stillHeld: async () =>
      ((await grantRef(deps.db, grant.corporationId).get()).data() as CorpSyncGrantDoc | undefined)
        ?.encryptedRefreshToken === grant.encryptedRefreshToken,
  });
  if (result.kind === 'stopped') return stopGrant(deps, grant, result.reason);
  if (result.kind === 'skipped' && result.reason === 'esi-refused') {
    if (status?.lastRun?.reason === 'esi-refused') return stopGrant(deps, grant, 'esi-refused');
  }
  await recordRun(deps, grant, result, 'systemIds' in result ? result.systemIds : undefined);
  return result;
}

async function recordRun(
  deps: CorpSyncDeps,
  grant: CorpSyncGrantDoc,
  result: Exclude<BookSyncResult, { kind: 'stopped' }>,
  systemIds: Record<number, number> | undefined
): Promise<void> {
  const lastRun: NonNullable<ScheduledSyncStatus['lastRun']> =
    result.kind === 'synced'
      ? {
          at: deps.now(),
          outcome: 'synced',
          observedRows: result.observedRows,
          extractions: result.extractions,
          donationsAdded: result.donationsAdded,
          missing: result.missing,
        }
      : { at: deps.now(), outcome: 'skipped', reason: result.reason };
  const ref = statusRef(deps.db, grant.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const held = (await tx.get(ref)).data() as ScheduledSyncStatus | undefined;
    if (!held || held.status !== 'active' || held.characterId !== grant.characterId) return;
    tx.update(ref, {
      lastRun,
      ...(systemIds && Object.keys(systemIds).length > 0
        ? { systemIds: { ...(held.systemIds ?? {}), ...systemIds } }
        : {}),
    });
  });
}

async function stopGrant(
  deps: CorpSyncDeps,
  grant: CorpSyncGrantDoc,
  reason: StopReason
): Promise<BookSyncResult> {
  const stoppedAt = deps.now();
  const stopped = await deps.db.runTransaction(async (tx) => {
    const ref = grantRef(deps.db, grant.corporationId);
    const held = (await tx.get(ref)).data() as CorpSyncGrantDoc | undefined;
    if (!held || held.encryptedRefreshToken !== grant.encryptedRefreshToken) return false;
    tx.delete(ref);
    const status: ScheduledSyncStatus = {
      status: 'stopped',
      characterId: grant.characterId,
      characterName: grant.characterName,
      enabledAt: grant.enabledAt,
      stoppedAt,
      stoppedReason: reason,
    };
    tx.set(statusRef(deps.db, grant.corporationId), status);
    appendAudit(
      tx,
      bookDeps(deps),
      grant.corporationId,
      { characterId: grant.characterId, name: grant.characterName, via: SCHEDULED_VIA },
      'scheduledSyncStopped',
      { reason }
    );
    return true;
  });
  if (stopped && reason !== 'token-revoked' && reason !== 'grant-unreadable') {
    await revokeStored(deps, grant);
  }
  deps.log('Scheduled Corp Tax Book sync stopped', { corporationId: grant.corporationId, reason });
  if (stopped) await notifyStopped(deps, grant, reason, stoppedAt);
  return { kind: 'stopped', reason };
}

async function pushStopped(
  deps: CorpSyncDeps,
  push: PushSender,
  grant: CorpSyncGrantDoc,
  reason: StopReason,
  stoppedAt: number
): Promise<void> {
  if (!isAlertedStop(reason)) return;
  try {
    const now = deps.now();
    const officers = await bookRef(deps.db, grant.corporationId).collection(OFFICERS).get();
    const recipients = syncStoppedRecipients(
      officers.docs.map((doc) => doc.data()),
      grant.characterId,
      reason,
      now
    );
    const fires = syncStoppedFires(recipients, {
      corporationId: grant.corporationId,
      reason,
      characterName: grant.characterName,
      stoppedAt,
    });
    await Promise.all(fires.map((fire) => deliverServerEvent(deps.db, push, fire, now, deps.log)));
  } catch (err) {
    deps.log('corpTaxBookSyncStopped push failed', {
      corporationId: grant.corporationId,
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
}

async function notifyStopped(
  deps: CorpSyncDeps,
  grant: CorpSyncGrantDoc,
  reason: StopReason,
  stoppedAt: number
): Promise<void> {
  if (!deps.push) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<true>((resolve) => {
    timer = setTimeout(() => resolve(true), deps.notifyBudgetMs ?? SYNC_STOPPED_NOTIFY_BUDGET_MS);
  });
  const late = await Promise.race([
    pushStopped(deps, deps.push, grant, reason, stoppedAt),
    timedOut,
  ]);
  clearTimeout(timer);
  if (late) {
    deps.log('corpTaxBookSyncStopped push timed out', { corporationId: grant.corporationId });
  }
}
