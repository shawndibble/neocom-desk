// Corp Tax Book sync grant custody and the scheduled run (issue #4068, ADR 0025).
// Modelled on the Alerts Grant (alertGrant.ts, ADR 0020): a narrow, opt-in second
// SSO authorization whose refresh token the server holds encrypted and rotates.
// One holder per corporation, so the grant doc is keyed by corporation id:
//
//   corpTaxBookSyncGrants/{corporationId}        function-only (firestore.rules): the encrypted token
//   corps/{corp}/meta/scheduledSync       what officers may see: holder, status, why it
//                                                stopped, the last run. No token, ever.
//
// A grant exists only while the schedule is active. When it stops (role lost,
// left the corp, token revoked, book off) or is revoked, the token doc is deleted
// and the token revoked at SSO, so a stopped schedule holds nothing. Nothing here
// logs or returns a token.

import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { SsoRefreshError, type RefreshedTokens } from './alertGrant.js';
import { decryptRefreshToken, encryptRefreshToken, rotateStoredToken } from './alertGrantCrypto.js';
import { boundedString, record } from './communities.js';
import { CORP_SYNC_SCOPES } from './corpSyncScopes.js';
import {
  FEEDER_OF_COLLECTION,
  META,
  decideRoles,
  parseBookCall,
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

export const CORP_SYNC_GRANTS_COLLECTION = 'corpTaxBookSyncGrants';
export const SCHEDULED_SYNC_DOC = 'scheduledSync';

export { CORP_SYNC_SCOPES };

/** `corpTaxBookSyncGrants/{corporationId}`. */
export interface CorpSyncGrantDoc {
  corporationId: number;
  characterId: number;
  characterName: string;
  /** AES-256-GCM blob, see alertGrantCrypto.ts (purpose `corpSyncGrant`). */
  encryptedRefreshToken: string;
  /** The client_id the token was issued to; SSO revoke needs it. */
  clientId: string;
  enabledAt: number;
  /**
   * 'feeder' is the second narrow grant kind: a feeder corporation's mining-only
   * token (FEEDER_SYNC_SCOPES), keyed by the feeder's corporation id. Absent means 'book'.
   */
  kind?: 'book' | 'feeder';
  /** Feeder grants: the signed-in Character who handed it over (the holder above may be their alt). */
  grantedBy?: number;
  /** Feeder grants: the Collector whose book the feeder feeds. */
  collectorCorporationId?: number;
  /**
   * Feeder grants: the token also carries `esi-universe.read_structures.v1`, so the sync reads
   * its refineries' names and systems (#4654). Absent on grants from before: never looked up.
   */
  readsStructures?: boolean;
  /**
   * Book grants: when the scheduled run next syncs this book (ms). The run queries `<= now`, so a
   * book synced within `SYNC_REST_MS` is not read at all. Feeder grants never carry it (the feeder
   * pass reads them). A book grant from before it is backfilled as due.
   */
  nextSyncAt?: number;
}

/** `corps/{corp}/meta/scheduledSync`: officers read this, nobody writes it but the functions. */
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
  /** Refinery → solar system, remembered so a scheduled row keeps the system an officer's visit set. */
  systemIds?: Record<string, number>;
}

export interface CorpSyncDeps {
  db: Firestore;
  now: () => number;
  /** Lazy: a missing secret must only fail calls that actually need the key. */
  key: () => Buffer;
  verify: (accessToken: string) => Promise<EveTokenClaims>;
  refresh: (clientId: string, refreshToken: string) => Promise<RefreshedTokens>;
  revoke: (clientId: string, refreshToken: string) => Promise<void>;
  readIdentity: IdentityReader;
  /** Prices the moon owner's view, rebuilt after each ledger read (issue #4512). */
  openPrices?: OpenPricesReader;
  /**
   * ESI for a moon owner's last ledger read before its grant is dropped (Leave, a removal
   * taking effect). Without it the feed ends on the last scheduled read.
   */
  esi?: SyncEsi;
  /** Receives only messages and ids — never a token. */
  log: (message: string, data?: Record<string, unknown>) => void;
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
});

function sameScopes(scopes: readonly string[]): boolean {
  return (
    scopes.length === CORP_SYNC_SCOPES.length && CORP_SYNC_SCOPES.every((s) => scopes.includes(s))
  );
}

// --- Opt in ----------------------------------------------------------------

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

  // The access token alone proves nothing about the refresh token beside it:
  // redeeming the refresh token at SSO proves it is a live token for this same
  // Character, and hands back the rotated one, which is the one to store.
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
    // A fresh document: the previous holder's stop reason and last run do not carry over.
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

  // The replaced token is orphaned; revoke it, best effort. The refresh above
  // usually rotated a same-Character token already, so skip if it is the one just stored.
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

/** Decrypt and revoke a stored token at SSO (unless it equals `keepToken`). False if it could not be done. */
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

// --- Revoke ----------------------------------------------------------------

/**
 * The holder revokes their own grant, or the corporation's CEO revokes anyone's
 * (the CEO's role is checked live, so the call carries an access token). The
 * doc goes first: a revoke failure must never leave a token we meant to drop
 * sitting in Firestore.
 */
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

/**
 * Delete the grant doc and the status doc together with an audit entry, if the
 * stored grant is still the one the caller was authorised against: a re-grant
 * that landed since is someone else's.
 */
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

/**
 * The book is being deleted: drop the corporation's grant and its status without
 * auditing (the audit log goes with the book) and revoke the token at SSO.
 */
export async function dropCorpSyncGrant(deps: CorpSyncDeps, corporationId: number): Promise<void> {
  const grant = (await grantRef(deps.db, corporationId).get()).data() as
    CorpSyncGrantDoc | undefined;
  if (!grant) return;
  await grantRef(deps.db, corporationId).delete();
  await revokeStored(deps, grant);
}

/** A Character's grants go with it when the account is purged (ADR 0020's rule, for this grant too). */
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
      // A feeder grant has no book status or audit entry here: drop the token and revoke it.
      await doc.ref.delete();
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

// --- The scheduled run -----------------------------------------------------

export interface RunSummary {
  grants: number;
  synced: number;
  skipped: number;
  stopped: number;
  /** True when ESI's shared budget made the run stop early. */
  budgetStopped: boolean;
  /** The feeder pass (#4509): runs after every book, so a feeder never holds one up. */
  feeders: { read: number; stale: number; skipped: number; disconnected: number };
}

export interface FeederRunOptions {
  /** Pause between feeders so a run never bursts at ESI. */
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Pause between one feeder's pull and the next. */
export const FEEDER_GAP_MS = 1500;

/**
 * Sync every opted-in corporation's book, one at a time (the ESI error budget is
 * shared by every user of the client id, and each sync is many small writes).
 * A corporation that fails is skipped and tried again next run; a budget hit
 * ends the whole run.
 */
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
  for (const grant of due) {
    if (summary.budgetStopped || esi.budgetLow()) {
      summary.budgetStopped = true;
      summary.skipped += 1;
      continue;
    }
    // A feeder grant is not a book: the feeder pass below reads it.
    if (grant.kind === 'feeder') {
      summary.grants -= 1;
      continue;
    }
    try {
      const result = await runOne(deps, esi, grant);
      if (result.kind === 'synced') {
        summary.synced += 1;
        await deferNextSync(deps, grant);
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
  if (!summary.budgetStopped) await runFeederSyncs(deps, esi, summary, feederOptions);
  return summary;
}

/** A synced book rests this long; under the 6-hourly schedule, so a late run never skips a slot. */
export const SYNC_REST_MS = 5 * 3_600_000;

/** One doc, set once the `nextSyncAt` backfill has covered every book grant from before it. */
const GRANT_BACKFILL_DOC = 'corpTaxBookSyncGrantMeta/nextSyncAtBackfill';

/**
 * Book grants whose `nextSyncAt` has come: a range query, so a run's reads scale with the due
 * grants, not with every grant. A grant from before the field cannot match a range, so the first
 * run scans once and marks each as due, then records that it did.
 */
async function dueGrants(deps: CorpSyncDeps): Promise<CorpSyncGrantDoc[]> {
  const marker = deps.db.doc(GRANT_BACKFILL_DOC);
  if (!(await marker.get()).exists) {
    const all = await deps.db.collection(CORP_SYNC_GRANTS_COLLECTION).get();
    const writer = deps.db.batch();
    let missing = 0;
    for (const doc of all.docs) {
      const held = doc.data() as CorpSyncGrantDoc;
      if (held.kind === 'feeder' || held.nextSyncAt !== undefined) continue;
      writer.update(doc.ref, { nextSyncAt: 0 });
      missing += 1;
    }
    if (missing > 0) await writer.commit();
    await marker.set({ doneAt: deps.now(), backfilled: missing });
  }
  const snap = await deps.db
    .collection(CORP_SYNC_GRANTS_COLLECTION)
    .where('nextSyncAt', '<=', deps.now())
    .get();
  return snap.docs.map((d) => d.data() as CorpSyncGrantDoc);
}

/** Rest a synced book until its next slot. A revoke or re-grant meanwhile is left as it is. */
async function deferNextSync(deps: CorpSyncDeps, grant: CorpSyncGrantDoc): Promise<void> {
  const ref = grantRef(deps.db, grant.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const held = (await tx.get(ref)).data() as CorpSyncGrantDoc | undefined;
    if (!held || held.enabledAt !== grant.enabledAt) return;
    tx.update(ref, { nextSyncAt: deps.now() + SYNC_REST_MS });
  });
}

// --- The feeder pass (#4509) ---------------------------------------------------

/**
 * Read every feeder's ledger, one at a time, after the books. Driven by the
 * feeder → Collector pointers rather than the grant docs, so a feeder whose token
 * died (grant doc gone) still ages toward disconnect. One feeder's failure never
 * touches another or a book.
 */
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

/**
 * One feeder's pull. The first pull at grant time is this same call (the grant
 * ticket, #4511, calls `syncOneFeeder`). A refusal keeps the token (a lost
 * role can come back); a dead token drops it and the feeder stays stale.
 */
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
    // A skip, or another refusal in a spell already stale, moved nothing the view shows.
    if (recorded?.viewChanged) {
      await tryRebuildFeederView(bookDeps(deps), collectorCorporationId, feederCorporationId);
    }
    const status = recorded?.status ?? null;
    // At 30 days stale the feeder disconnects; its token has no further use.
    if (status === 'disconnected' && grant) await dropFeederGrant(deps, grant);
    return { outcome: read.outcome, status, budget };
  };

  const grantSnap = await grantRef(deps.db, feederCorporationId).get();
  const grant = grantSnap.data() as CorpSyncGrantDoc | undefined;
  if (!grant || grant.kind !== 'feeder') return finish({ outcome: 'stale', reason: 'no-grant' });
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
    // A dead or unreadable token cannot be sent to SSO to revoke.
    await dropFeederGrant(deps, grant, false);
    return finish({
      outcome: 'stale',
      reason: refreshed.kind === 'dead' ? 'token-revoked' : 'grant-unreadable',
    });
  }

  // SSO rotated the token: later writes guard on, and revoke, the rotated one.
  const live = refreshed.grant;
  const read = await readFeederLedger(esi, feederCorporationId, refreshed.accessToken);
  const outcome = outcomeOf(read);
  storm.record(outcome);
  if (read.kind === 'refused') return finish({ outcome, reason: 'esi-refused' }, false, live);
  if (read.kind === 'budget') return finish({ outcome, reason: 'esi-budget' }, true, live);
  if (read.kind === 'unavailable') {
    return finish({ outcome, reason: 'esi-unavailable' }, false, live);
  }

  // A revoke or replacement that landed during the (slow) reads must not leave this token writing.
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
  await mergeObservedInto(bookDeps(deps), collectorCorporationId, read.rows);
  // Refinery names and systems (#4654): best effort, never part of the feeder's health.
  try {
    await refreshRefineryStructures(
      bookDeps(deps),
      esi,
      collectorCorporationId,
      feederCorporationId,
      read.rows.map((r) => r.structureId),
      refreshed.accessToken,
      live.readsStructures === true
    );
  } catch (err) {
    deps.log('Refinery structure lookup failed', {
      feederCorporationId,
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
  return finish({ outcome, refineries: read.refineries }, false, live);
}

/** Delete a feeder's token doc, guarded on the stored token, and revoke it at SSO unless it is dead. */
async function dropFeederGrant(
  deps: CorpSyncDeps,
  grant: CorpSyncGrantDoc,
  revoke = true
): Promise<void> {
  const removed = await deps.db.runTransaction(async (tx) => {
    const ref = grantRef(deps.db, grant.corporationId);
    const held = (await tx.get(ref)).data() as CorpSyncGrantDoc | undefined;
    if (!held || held.encryptedRefreshToken !== grant.encryptedRefreshToken) return false;
    tx.delete(ref);
    return true;
  });
  if (removed && revoke) await revokeStored(deps, grant);
}

type RefreshOutcome =
  | { kind: 'ok'; accessToken: string; grant: CorpSyncGrantDoc }
  | { kind: 'dead' }
  | { kind: 'unreadable' }
  | { kind: 'skip' };

// SSO rotates the token, so the SSO call must not run inside a retryable
// transaction (a retry would redeem the already-rotated token and look like
// invalid_grant). Read, call SSO once, then write the rotated token back in a
// transaction that re-reads the doc: if a re-grant replaced the token in the
// meantime, the rotated one is discarded instead of overwriting it.
async function refreshGrant(deps: CorpSyncDeps, grant: CorpSyncGrantDoc): Promise<RefreshOutcome> {
  const key = deps.key();
  let current: string;
  try {
    current = decryptRefreshToken(grant.encryptedRefreshToken, grant.characterId, key, PURPOSE);
  } catch {
    // The saved blob cannot be read (a rotated key, a damaged doc): it will never work again.
    return { kind: 'unreadable' };
  }
  let tokens: RefreshedTokens;
  try {
    tokens = await deps.refresh(grant.clientId, current);
  } catch (err) {
    if (err instanceof SsoRefreshError && err.invalidGrant) return { kind: 'dead' };
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
    // A re-grant, revoke or leave replaced the grant mid-refresh: the rotated token is live at
    // SSO and stored nowhere, so it goes too, unless the grant now holds that very token.
    await revokeUnlessHeld(deps, grant, tokens.refreshToken, written ?? undefined);
    return { kind: 'skip' };
  }
  return {
    kind: 'ok',
    accessToken: tokens.accessToken,
    grant: { ...grant, encryptedRefreshToken: rotated },
  };
}

/** Revoke `token` at SSO unless `held` stores it (best effort; never logs the token). */
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
    } catch {
      // Unreadable: it cannot be this token.
    }
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
  if (refreshed.kind === 'dead') return stopGrant(deps, initial, 'token-revoked');
  if (refreshed.kind === 'unreadable') return stopGrant(deps, initial, 'grant-unreadable');
  const { accessToken, grant } = refreshed;

  const claims = await deps.verify(accessToken);

  // Roles are re-checked every run with the holder's own token.
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
  if (!roles.canEdit) return stopGrant(deps, grant, 'role-lost');

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
  // One refusal on the ledger after the role check passed only skips the run; the same
  // refusal on the next run stops the schedule.
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
          settled: result.settled,
          missing: result.missing,
        }
      : { at: deps.now(), outcome: 'skipped', reason: result.reason };
  // Merge: the status doc may have been replaced (re-grant, revoke) while the sync ran.
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

/**
 * Stop the schedule for a corporation: delete the token doc (a stopped schedule
 * holds nothing), keep the reason where officers can read it, audit it, and revoke
 * the token at SSO. Guarded on the stored token: a re-grant that landed during the
 * run keeps its fresh schedule.
 */
async function stopGrant(
  deps: CorpSyncDeps,
  grant: CorpSyncGrantDoc,
  reason: StopReason
): Promise<BookSyncResult> {
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
      stoppedAt: deps.now(),
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
  // A dead or unreadable token cannot be sent to SSO to revoke.
  if (stopped && reason !== 'token-revoked' && reason !== 'grant-unreadable') {
    await revokeStored(deps, grant);
  }
  deps.log('Scheduled Corp Tax Book sync stopped', { corporationId: grant.corporationId, reason });
  return { kind: 'stopped', reason };
}
