import { utcDay } from './timeConstants.js';
import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  FieldPath,
  FieldValue,
  type CollectionReference,
  type DocumentSnapshot,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { chunk, IN_QUERY_LIMIT } from './chunk.js';
import { absorbedMinerIds, loadRekeyRecords, MINER_KEYED, planRekey } from './corpTaxBookRekey.js';
import {
  loadStampContext,
  restampStructures,
  stampBook,
  stampRows,
} from './corpTaxBookExtractionStamp.js';
import { backfillObservedUpdatedAt } from './corpTaxBookObservedBackfill.js';
import { cacheOfficer, readOfficerCache, revokeOfficer } from './officerCache.js';
import {
  ACCESS_TTL_MS,
  ADJUSTMENTS,
  AUDIT,
  BOOKS_COLLECTION,
  DECLARATIONS,
  DISMISSALS,
  DISPUTES,
  disputeIdFor,
  type ClaimCheck,
  type ClaimTransfer,
  checkClaimedTransfers,
  type DeclareOwnInput,
  type DisputeConflictInput,
  type DisputeKind,
  type WithdrawDisputeInput,
  EXTRACTIONS,
  FEEDER_INVITES_COLLECTION,
  BILLED_BY_COLLECTION,
  FEEDERS,
  FEEDER_OF_COLLECTION,
  FEEDER_PREVIOUS_COLLECTION,
  MEMBER_SETUP_MS,
  META,
  SCHEDULED_SYNC_DOC,
  MINERS,
  RUNNING_ACCOUNTS,
  OBSERVED,
  OFFICERS,
  PAID_DOC,
  UNCOUNTED_DOC,
  UNCOUNTED_IGNORED_MAX,
  PAYMENTS,
  REBILLS,
  TOKENS_COLLECTION,
  LATE_NOTICES,
  WRITE_OFFS,
  TOLERANCE_EXEMPTIONS,
  MINER_PAID,
  needsLiveCheck,
  dismissalNeedsDirector,
  defaultSettings,
  parseRecordKey,
  billedDisputeTax,
  disputesClosedByWriteOff,
  checkpointRefusal,
  handRecordMatch,
  mergeDisputeLines,
  type RecordedOre,
  moveStartRate,
  sameDivisions,
  rateKey,
  startDateMoveReason,
  satisfies,
  type BookCall,
  type EditAction,
  type Need,
  type OfficerAccess,
  type OfficerRoles,
  type StoredRate,
  type SyncInput,
  type TurnOnInput,
  donationsReadAtPatch,
} from './corpTaxBook.js';
import {
  BOOK_DEFAULTS,
  extractionIdOf,
  forfeitAllowed,
  rateStartRefusal,
  latestRecordedCorp,
  disputeHolds,
  readHoldingDisputes,
  mergeObservedRows,
  observedRowKey,
  shiftDate,
  type CorpRecord,
  type CoveragePeriod,
  type MirrorExtraction,
  type ObservedRow,
} from './corpTaxBookEngine.js';
import { type FeederExtraction, type StoredExtractionKey } from './corpTaxBookSyncEngine.js';
import { ledgerDays, ledgerPayments, liveRunningAccount } from './corpTaxBookRunningAccounts.js';
import type { IdentityReader } from './corpTaxBookEsi.js';
import { SRP_COLLECTIONS } from './srpTypes.js';
import { VETTING_COLLECTIONS } from './vettingTypes.js';
import { withoutVersionStamp } from './corpTaxBookVersionTracking.js';
import { isMissingIndex } from './indexedSweep.js';
import { FEEDER_OBSERVED, rollupChanges, writeRollupChanges } from './corpTaxBookFeederRollup.js';
import { OBSERVED_UPDATED_AT_FIELD } from './corpTaxBookVersionKeys.js';
import { POP_SHARING_DOC, applyMoonOverride, popSharingFrom } from './popSharing.js';
import type { CorporationAllianceLookup } from './sharedPopsEsi.js';
import {
  EDITOR_CHECKED_AT,
  editorStampFields,
  refreshSharedPops,
  sharedPopsRepublish,
  sharedPopSourcesRef,
  sharedPopsRef,
  stampEditorUseIfSharing,
  stampFailedRoleCheck,
} from './sharedPopsStore.js';
import { refreshMoonDocs } from './corpTaxBookMoonDocsStore.js';
import {
  currentMinerOf,
  ownerFields,
  soloCharacterId,
  soloMinerId,
  type MatchBook,
  type UncountedDonation,
} from './corpTaxBookDonationMatch.js';
import { loadMatchBook } from './corpTaxBookDonationMatchStore.js';
import { refreshReadModels } from './corpTaxBookReadModelsStore.js';
import { movesReadModels } from './corpTaxBookReadModels.js';
import {
  fail,
  requireLiveRoles,
  signedInCharacter,
  verifyCallerToken,
  type Caller,
} from './actorAuth.js';
import {
  DAY_TOLERANCE_PCT_DEFAULT,
  NOTICE_DEFAULTS,
  type AuditAction,
} from './corpTaxBookKinds.js';
import { provenCharacterIds } from './playerLayerStore.js';
import {
  classifyGroup,
  groupConflicts,
  minerReaderIds,
  minerUidsOf,
  promoteClaims,
  type ClaimMiner,
  type GroupConflict,
} from './corpTaxBookClaims.js';
import type { EveTokenClaims } from './verifyEveToken.js';
import { isLocked, lockDateFor, type RunningAccountCheckpoint } from './corpTaxBookCheckpoint.js';
import { pullWindow } from './corpTaxBookMoonDocs.js';
import {
  NOTICE_ID_FIELD,
  type LateNotice,
  adjustmentLineKey,
  lastNoticedDay,
  lateNoticeRefusal,
  noticedDates,
  reminderAllowed,
} from './corpTaxBookLateNotice.js';
import {
  dbReader,
  type DocReader,
  issueLateNoticeDocs,
  readNotices,
  ofCharacterFilter,
  ofMinerFilter,
  readLateNotice,
  writeNoticeMail,
} from './corpTaxBookLateNoticeStore.js';

export type OpenPricesReader = (typeId: number) => Promise<unknown | null>;

export interface BookDeps {
  db: Firestore;
  now: () => number;
  verifyToken: (accessToken: string) => Promise<EveTokenClaims>;
  readIdentity: IdentityReader;
  openPrices?: OpenPricesReader;
  corporationCeo?: (corporationId: number) => Promise<number | undefined>;
  corporationAlliance?: CorporationAllianceLookup;
}

type Data = Record<string, unknown>;

export const bookRef = (db: Firestore, corporationId: number) =>
  db.collection(BOOKS_COLLECTION).doc(String(corporationId));
export const feederRef = (db: Firestore, collector: number, feeder: number) =>
  bookRef(db, collector).collection(FEEDERS).doc(String(feeder));
const sub = (db: Firestore, corporationId: number, name: string) =>
  bookRef(db, corporationId).collection(name);

export async function liveOfficerIds(
  deps: Pick<BookDeps, 'db' | 'now'>,
  corporationId: number
): Promise<number[]> {
  const now = deps.now();
  const officers = await sub(deps.db, corporationId, OFFICERS).get();
  const ids = officers.docs.flatMap((d) => {
    const id = d.get('characterId');
    const expires = d.get('expiresAt');
    return typeof id === 'number' && typeof expires === 'number' && expires > now ? [id] : [];
  });
  return [...new Set(ids)];
}

const rand = (bytes = 6) => randomBytes(bytes).toString('base64url');

export interface AuthOptions {
  live: boolean;
}

export async function authorizeOfficer(
  deps: BookDeps,
  caller: Caller,
  call: BookCall,
  need: Need,
  options: AuthOptions
): Promise<OfficerAccess> {
  const characterId = signedInCharacter(caller);
  const now = deps.now();
  const officerRef = sub(deps.db, call.corporationId, OFFICERS).doc(caller.uid);
  const { held, usable } = await readOfficerCache(officerRef, caller, call.corporationId, now);

  let access: OfficerAccess;
  if (call.accessToken === undefined) {
    if (!usable) {
      fail(
        held ? 'failed-precondition' : 'permission-denied',
        'Verify as an officer first',
        held ? 'officer-check-stale' : 'not-an-officer'
      );
    }
    if (options.live)
      fail('failed-precondition', 'This needs a fresh role check', 'live-check-required');
    access = usable;
  } else {
    const actor = await verifyCallerToken(deps, caller, call.accessToken);
    const { claims } = actor;
    if (!options.live && usable) {
      access = usable;
    } else {
      const { identity, roles } = await requireLiveRoles(deps, actor, {
        corporationId: call.corporationId,
        need: 'canView',
        denied: { message: 'No officer role in this corporation', reason: 'not-an-officer' },
        onDenied: async () => {
          await stampFailedRoleCheck(deps.db, call.corporationId, characterId, now);
          await revokeOfficer(officerRef, held);
        },
      });
      access = {
        ...roles,
        characterId,
        characterName: claims.name,
        ownerHash: caller.ownerHash,
        corporationId: call.corporationId,
        roles: identity.roles,
        checkedAt: now,
        expiresAt: now + ACCESS_TTL_MS,
      };
      if ((await bookRef(deps.db, call.corporationId).get()).exists)
        await cacheOfficer(officerRef, withEditorCheck(access, held));
    }
  }
  if (!satisfies(access, need)) {
    if (need !== 'view' && !access.canEdit)
      await stampFailedRoleCheck(deps.db, call.corporationId, characterId, now);
    throw new HttpsError('permission-denied', `This needs the ${need} role`, {
      reason: 'role-required',
      need,
    });
  }
  if (access.canEdit)
    await stampEditorUseIfSharing(deps.db, call.corporationId, access, now, {
      ref: officerRef,
      held: held as Data | undefined,
    });
  return access;
}

function withEditorCheck(access: OfficerAccess, held: OfficerAccess | undefined): OfficerAccess {
  const checkedAt = (held as Data | undefined)?.[EDITOR_CHECKED_AT];
  return held?.ownerHash === access.ownerHash && held.canEdit && typeof checkedAt === 'number'
    ? ({ ...access, [EDITOR_CHECKED_AT]: checkedAt } as OfficerAccess)
    : access;
}

export interface VerifyOfficerResult extends OfficerRoles {
  corporationId: number;
  bookActive: boolean;
  expiresAt: number;
}

export async function verifyOfficer(
  deps: BookDeps,
  caller: Caller,
  call: BookCall
): Promise<VerifyOfficerResult> {
  if (call.accessToken === undefined)
    fail('invalid-argument', 'accessToken is required', 'token-required');
  const access = await authorizeOfficer(deps, caller, call, 'view', { live: false });
  const book = (await bookRef(deps.db, call.corporationId).get()).data();
  return {
    corporationId: call.corporationId,
    isCeo: access.isCeo,
    isDirector: access.isDirector,
    isStationManager: access.isStationManager,
    canView: access.canView,
    canEdit: access.canEdit,
    bookActive: book?.active === true,
    expiresAt: access.expiresAt,
  };
}

export interface Actor {
  characterId: number | null;
  name: string;
  via?: string;
}

export function appendAudit(
  tx: Transaction,
  deps: BookDeps,
  corporationId: number,
  actor: Actor,
  action: AuditAction,
  detail: Data
): void {
  const at = deps.now();
  const id = `${String(at).padStart(15, '0')}~${rand()}`;
  tx.create(sub(deps.db, corporationId, AUDIT).doc(id), {
    at,
    by: actor.characterId,
    byName: actor.name,
    ...(actor.via ? { via: actor.via } : {}),
    action,
    detail,
  });
}

export const SCHEDULED_VIA = 'scheduled sync';

const actorOf = (access: OfficerAccess, via?: string): Actor => ({
  characterId: access.characterId,
  name: access.characterName,
  ...(via ? { via } : {}),
});

export async function turnOnBook(deps: BookDeps, caller: Caller, input: TurnOnInput) {
  const access = await authorizeOfficer(deps, caller, input, 'director', { live: true });
  const now = deps.now();
  if (input.startDate > utcDay(now))
    fail('invalid-argument', 'The start date cannot be in the future', 'start-in-future');
  const ref = bookRef(deps.db, input.corporationId);
  if (!(await ref.get()).exists) await deleteBilledByPointers(deps, input.corporationId);
  await deps.db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists)
      fail('already-exists', 'This corporation already has a Corp Tax Book', 'book-exists');
    if (
      (await tx.get(deps.db.collection(FEEDER_OF_COLLECTION).doc(String(input.corporationId))))
        .exists
    )
      fail('failed-precondition', 'This corporation feeds another book', 'is-a-feeder');
    const floor = await ownBookFloor((r) => tx.get(r), deps.db, input.corporationId);
    if (floor !== null && input.startDate < floor)
      fail('invalid-argument', 'The start date is before the leave day', 'start-before-leave');
    tx.create(ref, {
      ...defaultSettings(input.startDate, input.startRatePct),
      corporationId: input.corporationId,
      active: true,
      ownerCharacterId: access.characterId,
      createdAt: now,
      createdBy: access.characterId,
      lastSync: null,
      membersSeeFrom: now + MEMBER_SETUP_MS,
      schemaVersion: 1,
    });
    tx.set(sub(deps.db, input.corporationId, OFFICERS).doc(caller.uid), access);
    appendAudit(tx, deps, input.corporationId, actorOf(access), 'turnOn', {
      startDate: input.startDate,
      startRatePct: input.startRatePct,
    });
  });
  return { corporationId: input.corporationId };
}

export async function ownBookFloor(
  get: (ref: DocumentReference) => Promise<DocumentSnapshot>,
  db: Firestore,
  corporationId: number
): Promise<string | null> {
  const previous = await get(db.collection(FEEDER_PREVIOUS_COLLECTION).doc(String(corporationId)));
  const leftAt = previous.get('leftAt');
  if (typeof leftAt !== 'number') return null;
  const collector = previous.get('collectorCorporationId');
  if (typeof collector === 'number') {
    const record = await get(feederRef(db, collector, corporationId));
    const periods = (record.get('coveragePeriods') ?? []) as CoveragePeriod[];
    const ends = periods.map((p) => p.to);
    if (ends.length > 0 && ends.every((to) => typeof to === 'string')) {
      return shiftDate((ends as string[]).sort().at(-1)!, 1);
    }
  }
  return utcDay(leftAt);
}

export const KEPT_ON_BOOK_DELETE: readonly string[] = [...SRP_COLLECTIONS, ...VETTING_COLLECTIONS];

async function deleteBookContents(ref: DocumentReference): Promise<void> {
  for (const sub of await ref.listCollections()) {
    if (!KEPT_ON_BOOK_DELETE.includes(sub.id)) await ref.firestore.recursiveDelete(sub);
  }
  await ref.delete();
}

async function deleteBilledByPointers(deps: BookDeps, corporationId: number): Promise<void> {
  const key = String(corporationId);
  const field = new FieldPath('books', key);
  const pointers = await deps.db.collection(BILLED_BY_COLLECTION).where(field, '>=', 0).get();
  for (const part of chunk(pointers.docs, CHUNK)) {
    await Promise.all(
      part.map((pointer) =>
        deps.db.runTransaction(async (tx) => {
          const books = (await tx.get(pointer.ref)).get('books') as
            Record<string, unknown> | undefined;
          if (!books || !(key in books)) return;
          if (Object.keys(books).length === 1) tx.delete(pointer.ref);
          else tx.update(pointer.ref, field, FieldValue.delete());
        })
      )
    );
  }
}

export async function deleteBook(
  deps: BookDeps,
  caller: Caller,
  call: BookCall,
  beforeDelete: (corporationId: number) => Promise<void> = async () => {}
) {
  const access = await authorizeOfficer(deps, caller, call, 'director', { live: true });
  const ref = bookRef(deps.db, call.corporationId);
  const book = await ref.get();
  if (!book.exists) fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
  const openedBy = [book.get('createdBy'), book.get('ownerCharacterId')];
  if (!access.isCeo && !openedBy.includes(access.characterId)) {
    fail(
      'permission-denied',
      'Only whoever turned the book on, or the CEO, can delete it',
      'not-opener'
    );
  }
  await beforeDelete(call.corporationId);
  const links = await deps.db
    .collection(TOKENS_COLLECTION)
    .where('corporationId', '==', call.corporationId)
    .get();
  await Promise.all(links.docs.map((d) => d.ref.delete()));
  for (const name of [FEEDER_INVITES_COLLECTION, FEEDER_OF_COLLECTION]) {
    const stray = await deps.db
      .collection(name)
      .where('collectorCorporationId', '==', call.corporationId)
      .get();
    await Promise.all(stray.docs.map((d) => d.ref.delete()));
  }
  await deleteBookContents(ref);
  await deleteBookContents(ref);
  await Promise.all([
    sharedPopsRef(deps.db, call.corporationId).delete(),
    sharedPopSourcesRef(deps.db, call.corporationId).delete(),
  ]);
  await deleteBilledByPointers(deps, call.corporationId);
  return { deleted: true };
}

export async function reclaimBook(deps: BookDeps, caller: Caller, call: BookCall) {
  const access = await authorizeOfficer(deps, caller, call, 'ceo', { live: true });
  const now = deps.now();
  const ref = bookRef(deps.db, call.corporationId);
  const revoked = await deps.db.runTransaction(async (tx) => {
    const book = await tx.get(ref);
    if (!book.exists) fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
    const officers = await tx.get(sub(deps.db, call.corporationId, OFFICERS));
    let count = 0;
    for (const doc of officers.docs) {
      if (doc.id === caller.uid) continue;
      tx.delete(doc.ref);
      count += 1;
    }
    tx.update(ref, { active: true, ownerCharacterId: access.characterId, reclaimedAt: now });
    tx.set(
      officers.docs.find((d) => d.id === caller.uid)?.ref ??
        sub(deps.db, call.corporationId, OFFICERS).doc(caller.uid),
      access
    );
    appendAudit(tx, deps, call.corporationId, actorOf(access), 'reclaim', {
      officersRevoked: count,
    });
    return count;
  });
  return { officersRevoked: revoked };
}

const CHUNK = 200;
const WINDOW_FIELDS = ['chunkArrivalTime', 'naturalDecayTime', 'laserFiredAt', 'cancelledAt'];
const obsId = (r: ObservedRow) => `${r.characterId}_${r.typeId}_${r.date}_${r.structureId}`;

export async function syncBook(deps: BookDeps, caller: Caller, input: SyncInput) {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: false });
  return syncBookAs(deps, access, input);
}

export async function mergeObservedInto(
  deps: BookDeps,
  corporationId: number,
  incoming: readonly ObservedRow[],
  extractions: readonly MirrorExtraction[] = [],
  touched?: Set<string>
): Promise<number> {
  const rows = stampRows(incoming, await loadStampContext(deps.db, corporationId, extractions));
  let observedChanged = 0;
  const pulls = touched ?? new Set<string>();
  for (const part of chunk(rows, CHUNK)) {
    const col = sub(deps.db, corporationId, OBSERVED);
    observedChanged += await deps.db.runTransaction(async (tx) => {
      const unique = [...new Map(part.map((r) => [obsId(r), r])).values()];
      const refs = unique.map((r) => col.doc(obsId(r)));
      const snaps = refs.length > 0 ? await tx.getAll(...refs) : [];
      const existing = snaps.filter((s) => s.exists).map((s) => s.data() as ObservedRow);
      const { changed } = mergeObservedRows(existing, part);
      const last = new Map(changed.map((r) => [observedRowKey(r), r]));
      for (const r of last.values()) if (r.extractionId !== undefined) pulls.add(r.extractionId);
      for (const row of last.values()) {
        tx.set(col.doc(obsId(row)), {
          ...row,
          uid: `char:${row.characterId}`,
          [OBSERVED_UPDATED_AT_FIELD]: FieldValue.serverTimestamp(),
        });
      }
      writeRollupChanges(
        tx,
        sub(deps.db, corporationId, FEEDER_OBSERVED),
        rollupChanges([...last.values()], new Map(existing.map((r) => [observedRowKey(r), r])))
      );
      return last.size;
    });
  }
  await writeBilledByPointers(deps, corporationId, rows);
  if (touched === undefined) await refreshMoonDocs(deps.db, corporationId, pulls);
  return observedChanged;
}

export async function writeBilledByPointers(
  deps: BookDeps,
  corporationId: number,
  rows: readonly ObservedRow[]
): Promise<void> {
  const characterIds = [...new Set(rows.map((r) => r.characterId))];
  const at = Date.now();
  for (const part of chunk(characterIds, CHUNK)) {
    const batch = deps.db.batch();
    for (const characterId of part) {
      batch.set(
        deps.db.collection(BILLED_BY_COLLECTION).doc(`char:${characterId}`),
        { books: { [String(corporationId)]: at } },
        { merge: true }
      );
    }
    await batch.commit().catch(() => undefined);
  }
}

async function writeExtractions(
  deps: BookDeps,
  corporationId: number,
  incoming: readonly MirrorExtraction[],
  touched: Set<string>
): Promise<void> {
  const extractions = sub(deps.db, corporationId, EXTRACTIONS);
  const corrected = new Set<number>();
  for (const x of incoming) {
    const id = extractionIdOf(x);
    const fields: Data = { ...x, id };
    for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key];
    const held = (await extractions.doc(id).get()).data();
    if (!held || WINDOW_FIELDS.some((f) => fields[f] !== undefined && fields[f] !== held[f]))
      corrected.add(x.structureId);
    if (
      held &&
      Object.keys(fields).every((k) => JSON.stringify(fields[k]) === JSON.stringify(held[k]))
    )
      continue;
    touched.add(id);
    await extractions.doc(id).set(fields, { merge: true });
  }
  await restampStructures(deps.db, corporationId, [...corrected]).catch((e) =>
    console.error('extraction restamp failed', e instanceof Error ? e.message : e)
  );
}

async function cancelUnlistedFeederExtractions(
  deps: BookDeps,
  collectorCorporationId: number,
  feederCorporationId: number,
  listed: readonly MirrorExtraction[]
): Promise<string[]> {
  const now = new Date(deps.now()).toISOString();
  const keep = new Set(listed.map(extractionIdOf));
  const stored = await sub(deps.db, collectorCorporationId, EXTRACTIONS)
    .where('sourceCorporationId', '==', feederCorporationId)
    .get();
  const gone = stored.docs.filter((d) => {
    const x = d.data() as MirrorExtraction;
    return !x.cancelledAt && x.chunkArrivalTime > now && !keep.has(d.id);
  });
  for (const d of gone) await d.ref.update({ cancelledAt: now });
  return gone.map((d) => d.id);
}

export async function storedFeederExtractionKeys(
  deps: BookDeps,
  collectorCorporationId: number,
  feederCorporationId: number
): Promise<StoredExtractionKey[]> {
  const stored = await sub(deps.db, collectorCorporationId, EXTRACTIONS)
    .where('sourceCorporationId', '==', feederCorporationId)
    .get();
  return stored.docs.map((d) => d.data() as StoredExtractionKey);
}

export async function storeFeederExtractions(
  deps: BookDeps,
  collectorCorporationId: number,
  feederCorporationId: number,
  extractions: readonly FeederExtraction[],
  complete: boolean
): Promise<void> {
  const touched = new Set<string>();
  await writeExtractions(deps, collectorCorporationId, extractions, touched);
  if (complete) {
    const cancelled = await cancelUnlistedFeederExtractions(
      deps,
      collectorCorporationId,
      feederCorporationId,
      extractions
    );
    for (const id of cancelled) touched.add(id);
  }
  if (touched.size === 0) return;
  await refreshMoonDocs(deps.db, collectorCorporationId, touched);
  await refreshReadModels(deps.db, collectorCorporationId, deps.now());
  await refreshSharedPops(deps, collectorCorporationId);
}

export async function syncBookAs(
  deps: BookDeps,
  access: OfficerAccess,
  input: SyncInput,
  options: { scheduled?: boolean; matchBook?: MatchBook } = {}
) {
  const book = bookRef(deps.db, input.corporationId);
  const held = await book.get();
  if (!held.exists) fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
  if (input.extractions.length > 0 && !access.isStationManager) {
    fail(
      'permission-denied',
      'Extractions need the Station_Manager role',
      'station-manager-required'
    );
  }

  const touchedPulls = new Set<string>();
  const observedChanged = await mergeObservedInto(
    deps,
    input.corporationId,
    input.observed,
    input.extractions,
    touchedPulls
  );
  await backfillObservedUpdatedAt(deps.db, input.corporationId, deps.now).catch((e) =>
    console.error('observed backfill failed', e instanceof Error ? e.message : e)
  );

  await writeExtractions(deps, input.corporationId, input.extractions, touchedPulls);
  await stampBook(deps.db, input.corporationId, deps.now).catch((e) =>
    console.error('extraction stamp backfill failed', e instanceof Error ? e.message : e)
  );

  const payments = sub(deps.db, input.corporationId, PAYMENTS);
  let donationsAdded = 0;
  const matchBook =
    input.donations.length === 0
      ? undefined
      : (options.matchBook ?? (await loadMatchBook(deps.db, input.corporationId, input.donations)));
  const linked = await handRecordedTransfers(
    deps,
    input.corporationId,
    input.donations.map((dn) => `j${dn.division}_${dn.refId}`)
  );
  const unlinked = await unlinkedHandRecords(deps, input.corporationId, input.donations);
  for (const dn of input.donations) {
    const id = `j${dn.division}_${dn.refId}`;
    if (linked.has(id)) continue;
    if (await linkHandRecord(unlinked, dn, id)) continue;
    const owner = ownerFields(dn, matchBook!);
    const held = dn.reviewReason !== undefined && 'minerId' in owner;
    const data: Data = {
      id,
      source: 'donation',
      characterId: dn.characterId,
      uid: `char:${dn.characterId}`,
      amount: dn.amount,
      at: dn.at,
      division: dn.division,
      ...(dn.reason !== undefined ? { reason: dn.reason } : {}),
      ...(held ? { reviewReason: dn.reviewReason } : owner),
    };
    try {
      await payments.doc(id).create(data);
      donationsAdded += 1;
    } catch (err) {
      if ((err as { code?: number }).code !== 6) throw err;
    }
  }

  const quiet =
    options.scheduled === true &&
    observedChanged === 0 &&
    touchedPulls.size === 0 &&
    donationsAdded === 0 &&
    isDeepStrictEqual(
      input.gaps,
      (held.get('lastSync') as { gaps?: unknown } | undefined)?.gaps ?? []
    );
  const now = deps.now();
  await deps.db.runTransaction(async (tx) => {
    const readAt = input.donationsRead === false ? (await tx.get(book)).get('donationsReadAt') : 0;
    tx.update(book, {
      ...donationsReadAtPatch(input.donationsRead, readAt, now),
      lastSync: {
        at: now,
        byCharacterId: access.characterId,
        byName: access.characterName,
        ...(options.scheduled ? { scheduled: true } : {}),
        gaps: input.gaps,
      },
    });
    if (quiet) return;
    appendAudit(
      tx,
      deps,
      input.corporationId,
      actorOf(access, options.scheduled ? SCHEDULED_VIA : undefined),
      'sync',
      {
        observedChanged,
        extractions: input.extractions.length,
        donationsAdded,
        gaps: input.gaps.length,
      }
    );
  });
  if (input.uncounted !== undefined)
    await storeUncounted(deps, input.corporationId, input.uncounted).catch((e) =>
      console.error('uncounted donations write failed', e instanceof Error ? e.message : e)
    );
  await refreshMoonDocs(deps.db, input.corporationId, touchedPulls);
  if (!quiet && input.extractions.length > 0)
    await refreshReadModels(deps.db, input.corporationId, deps.now());
  const republish = await sharedPopsRepublish(deps, input.corporationId, !quiet);
  if (republish) await refreshSharedPops(deps, input.corporationId, republish);
  await promoteProvenClaims(deps, input.corporationId).catch((e) =>
    console.error('claim promotion failed', e instanceof Error ? e.message : e)
  );
  return { observedChanged, extractions: input.extractions.length, donationsAdded };
}

async function handRecordedTransfers(
  deps: BookDeps,
  corporationId: number,
  ids: readonly string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunk([...new Set(ids)], IN_QUERY_LIMIT)) {
    const snap = await sub(deps.db, corporationId, PAYMENTS)
      .where('transferId', 'in', part)
      .select('transferId')
      .get();
    for (const d of snap.docs) out.add(d.get('transferId') as string);
  }
  return out;
}

type HandRecord = { id: string; characterId: number; amount: number; at: string } & {
  snap: QueryDocumentSnapshot;
};

async function unlinkedHandRecords(
  deps: BookDeps,
  corporationId: number,
  donations: readonly { characterId: number }[]
): Promise<HandRecord[]> {
  const out: HandRecord[] = [];
  for (const part of chunk([...new Set(donations.map((d) => d.characterId))], IN_QUERY_LIMIT)) {
    const snap = await sub(deps.db, corporationId, PAYMENTS).where('characterId', 'in', part).get();
    for (const d of snap.docs)
      if (d.get('source') === 'manual' && d.get('transferId') === undefined)
        out.push({ ...(d.data() as Omit<HandRecord, 'snap'>), id: d.id, snap: d });
  }
  return out;
}

async function linkHandRecord(
  unlinked: HandRecord[],
  donation: { characterId: number; amount: number; at: string },
  transferId: string
): Promise<boolean> {
  const match = handRecordMatch(donation, { held: unlinked, uncounted: [] });
  const hand = unlinked.find((h) => h.id === match?.id);
  if (!hand) return false;
  unlinked.splice(unlinked.indexOf(hand), 1);
  try {
    await hand.snap.ref.update({ transferId }, { lastUpdateTime: hand.snap.updateTime });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 9) return false;
    throw e;
  }
}

async function storeUncounted(
  deps: BookDeps,
  corporationId: number,
  uncounted: NonNullable<SyncInput['uncounted']>
) {
  const ref = sub(deps.db, corporationId, META).doc(UNCOUNTED_DOC);
  await deps.db.runTransaction(async (tx) => {
    const held = (await tx.get(ref)).data();
    const ignored = new Set((held?.ignored as string[] | undefined) ?? []);
    const donations = uncounted.filter((u) => !ignored.has(u.id));
    if (isDeepStrictEqual(donations, held?.donations ?? [])) return;
    tx.set(ref, { donations }, { merge: true });
  });
}

interface EditCtx {
  deps: BookDeps;
  tx: Transaction;
  corporationId: number;
  book: Data;
  access: OfficerAccess;
  now: number;
  released: Set<string>;
}

interface EditOutcome {
  detail: Data;
  audits?: { action: AuditAction; detail: Data }[];
  result?: Data;
}

async function releasePaidThrough(
  c: EditCtx,
  minerId: string | null | undefined,
  reaching?: string
): Promise<void> {
  if (typeof minerId !== 'string') return;
  const held = (await c.tx.get(col(c, META).doc(PAID_DOC))).get(
    new FieldPath('minerPaidThrough', minerId)
  ) as unknown;
  const copy = await c.tx.get(col(c, MINER_PAID).doc(minerId));
  if (held === undefined && !copy.exists) return;
  const days = [held, copy.get('paidThrough')].filter((d): d is string => typeof d === 'string');
  if (reaching !== undefined && days.every((d) => d < reaching)) return;
  c.released.add(minerId);
}

function applyReleasedPaidThrough(c: EditCtx): void {
  if (c.released.size === 0) return;
  c.tx.set(
    col(c, META).doc(PAID_DOC),
    {
      minerPaidThrough: Object.fromEntries([...c.released].map((id) => [id, FieldValue.delete()])),
    },
    { merge: true }
  );
  for (const id of c.released) c.tx.delete(col(c, MINER_PAID).doc(id));
}

const reviewDone = (payment: Data): Data => ({
  ...(payment.reviewReason !== undefined ? { reviewReason: FieldValue.delete() } : {}),
  ...(payment.ambiguousMinerIds !== undefined ? { ambiguousMinerIds: FieldValue.delete() } : {}),
});

const hasLines = (d: Data) => Array.isArray(d.lines) && d.lines.length > 0;

const col = (c: EditCtx, name: string) => sub(c.deps.db, c.corporationId, name);
const bookOf = (c: EditCtx) => bookRef(c.deps.db, c.corporationId);

function refuseLocked(now: number, ...dates: unknown[]): void {
  const today = utcDay(now);
  if (dates.some((d) => typeof d === 'string' && isLocked(d, today)))
    fail('failed-precondition', 'History before the lock date is read-only', 'locked');
}

async function snapshotDropper(
  tx: Transaction,
  accounts: CollectionReference,
  minerIds: Iterable<string>
): Promise<(only?: string) => void> {
  const refs = [...new Set(minerIds)].map((id) => accounts.doc(id));
  const held = (refs.length > 0 ? await tx.getAll(...refs) : []).filter((s) => s.get('snapshot'));
  return (only) => {
    for (const s of held)
      if (only === undefined || s.id === only)
        tx.update(s.ref, { snapshot: FieldValue.delete(), uids: FieldValue.delete() });
  };
}

async function mustGet(c: EditCtx, ref: DocumentReference, what: string): Promise<Data> {
  const snap = await c.tx.get(ref);
  if (!snap.exists) fail('not-found', `${what} not found`, 'not-found');
  return snap.data() as Data;
}

function minerCharacters(minerId: string, miner: Data | undefined): number[] {
  if (miner) return miner.characterIds as number[];
  const solo = soloCharacterId(minerId);
  return solo === undefined ? [] : [solo];
}

function minerReaders(minerId: string, miner: Data | undefined): number[] {
  if (!miner) return minerCharacters(minerId, miner);
  return minerReaderIds({
    characterIds: miner.characterIds as number[],
    officerClaimed: (miner.officerClaimed as number[] | undefined) ?? [],
    pendingConfirmation: (miner.pendingConfirmation as number[] | undefined) ?? [],
  });
}

function requireDirectorAbove(c: EditCtx, amounts: readonly number[]): void {
  const sized = amounts.filter((a) => a > 0);
  if (sized.length === 0) return;
  if (
    dismissalNeedsDirector(
      c.book.dismissApprovalAboveIsk as number | null | undefined,
      sized,
      c.access.isDirector
    )
  ) {
    throw new HttpsError('permission-denied', 'A Director must approve this size of change', {
      reason: 'director-approval',
    });
  }
}

async function assertAdjustmentReversible(
  c: EditCtx,
  adjustmentId: string,
  adjustment: Record<string, unknown>
): Promise<void> {
  if (adjustment.reversed) fail('failed-precondition', 'Already reversed', 'already-reversed');
  const key = adjustmentLineKey(adjustmentId);
  const billed = (await minerNotices(c, adjustment.minerId as string)).some((n) =>
    n.lines.some((l) => l.key === key)
  );
  if (billed)
    fail(
      'failed-precondition',
      'A Late notice already listed this correction: add an opposite correction instead',
      'billed-on-notice'
    );
}

const dayTolerancePctOf = (book: Data): number =>
  typeof book.dayTolerancePct === 'number' ? book.dayTolerancePct : DAY_TOLERANCE_PCT_DEFAULT;

async function liveRunningAccountOf(c: EditCtx, minerId: string) {
  const [account, payments] = await Promise.all([
    c.tx.get(col(c, RUNNING_ACCOUNTS).doc(minerId)),
    c.tx.get(col(c, PAYMENTS).where('minerId', '==', minerId)),
  ]);
  return account.exists
    ? liveRunningAccount(
        account.data() as Data,
        payments.docs.map((d) => d.data()),
        dayTolerancePctOf(c.book)
      )
    : undefined;
}

async function knownMiner(c: EditCtx, minerId: string): Promise<boolean> {
  const [miner, account] = await c.tx.getAll(
    col(c, MINERS).doc(minerId),
    col(c, RUNNING_ACCOUNTS).doc(minerId)
  );
  if (miner.exists || account.exists) return true;
  const solo = soloCharacterId(minerId);
  if (solo === undefined) return false;
  const rows = await c.tx.get(col(c, OBSERVED).where('characterId', '==', solo).select().limit(1));
  return !rows.empty;
}

async function requireOpenMiner(c: EditCtx, minerId: string): Promise<void> {
  if (!(await knownMiner(c, minerId))) fail('not-found', 'Unknown Miner', 'unknown-miner');
  const miner = await c.tx.get(col(c, MINERS).doc(minerId));
  if (miner.exists && miner.get('closedAt') != null)
    fail('failed-precondition', "This Miner's account is closed", 'account-closed');
}

const minerNotices = (c: EditCtx, minerId: string) =>
  readNotices(c.tx, bookOf(c), ofMinerFilter(minerId));

async function mustGetNotice(c: EditCtx, id: string): Promise<LateNotice> {
  const notice = await readLateNotice(c.tx, bookRef(c.deps.db, c.corporationId), id);
  if (!notice) fail('not-found', 'Late notice not found', 'not-found');
  return notice;
}

async function minerUids(c: EditCtx, minerId: string): Promise<string[]> {
  return minerUidsOf(minerId, minerDocOf((await c.tx.get(col(c, MINERS).doc(minerId))).data()));
}

const minerDocOf = (miner: Data | undefined) =>
  miner && {
    characterIds: (miner.characterIds as number[] | undefined) ?? [],
    officerClaimed: miner.officerClaimed as number[] | undefined,
    pendingConfirmation: miner.pendingConfirmation as number[] | undefined,
  };

async function confirmDeclaration(
  c: EditCtx,
  declarationId: string | undefined,
  minerId: string,
  paymentId: string
): Promise<void> {
  if (declarationId === undefined) return;
  const ref = col(c, DECLARATIONS).doc(declarationId);
  const declaration = await mustGet(c, ref, 'Declaration');
  if (declaration.resolution) fail('failed-precondition', 'Already resolved', 'already-resolved');
  if (declaration.minerId !== undefined && declaration.minerId !== minerId)
    fail('invalid-argument', "Declaration is another Miner's", 'wrong-miner');
  c.tx.update(ref, {
    resolution: {
      kind: 'confirmed',
      at: new Date(c.now).toISOString(),
      by: c.access.characterId,
      paymentId,
    },
  });
}

const DECLINED_DOC = 'declinedAutoGroup';

const PLAYER_CHARACTERS = 'playerCharacters';

interface GroupPlan {
  officerClaimed: number[];
  pendingConfirmation: number[];
  provenCharacterIds: number[];
  readers: number[];
  confirmed: Set<number>;
  createdAt: string;
  conflicts: GroupConflict[];
}

const claimMinerOf = (id: string, d: Data): ClaimMiner => ({
  id,
  characterIds: (d.characterIds as number[]) ?? [],
  officerClaimed: [...((d.officerClaimed as number[] | undefined) ?? [])],
  provenCharacterIds: (d.provenCharacterIds as number[] | undefined) ?? [],
  ...(typeof d.createdAt === 'string' ? { createdAt: d.createdAt } : {}),
});

async function provenAmong(
  tx: Transaction,
  db: Firestore,
  characterIds: readonly number[]
): Promise<Set<number>> {
  if (characterIds.length === 0) return new Set();
  const docs = await tx.getAll(
    ...characterIds.map((id) => db.collection(PLAYER_CHARACTERS).doc(String(id)))
  );
  return new Set(docs.filter((d) => d.exists).map((d) => Number(d.id)));
}

async function planMiner(
  c: EditCtx,
  miners: readonly QueryDocumentSnapshot[],
  action: { minerId: string; characterIds: number[]; mainCharacterId: number },
  ignore: ReadonlySet<string>
): Promise<GroupPlan> {
  const mine = miners.find((d) => d.id === action.minerId)?.data();
  if (mine?.closedAt != null)
    fail('failed-precondition', "This Miner's account is closed", 'account-closed');
  const clash = miners.find(
    (d) =>
      d.id !== action.minerId &&
      !ignore.has(d.id) &&
      (d.data().characterIds as number[]).some((x) => action.characterIds.includes(x))
  );
  if (clash)
    fail('failed-precondition', 'A character is already in another Miner', 'already-grouped');
  const confirmed = new Set<number>((mine?.confirmedCharacterIds as number[] | undefined) ?? []);
  const retained = new Set<number>(confirmed);
  for (const d of miners)
    if (d.id === action.minerId || ignore.has(d.id))
      for (const x of minerReaders(d.id, d.data())) retained.add(x);
  const outside = new Set<number>();
  const minedHere = new Set<number>();
  for (const characterId of action.characterIds) {
    if (await recordedOutside(c, characterId)) outside.add(characterId);
    if (await recordedHereSince(c, characterId, '')) minedHere.add(characterId);
  }
  const proven = await provenAmong(c.tx, c.deps.db, action.characterIds);
  const group = classifyGroup({
    characterIds: action.characterIds,
    mainCharacterId: action.mainCharacterId,
    retained,
    pending: new Set<number>((mine?.pendingConfirmation as number[] | undefined) ?? []),
    proven,
    outside,
    minedHere,
  });
  if (group.outsiderMain)
    fail(
      'failed-precondition',
      'The main must be a corporation member when the group has one',
      'outsider-main'
    );
  const createdAt =
    typeof mine?.createdAt === 'string' ? mine.createdAt : new Date(c.now).toISOString();
  const after: ClaimMiner[] = miners
    .filter((d) => d.id !== action.minerId && !ignore.has(d.id))
    .map((d) => claimMinerOf(d.id, d.data()));
  after.push({
    id: action.minerId,
    characterIds: action.characterIds,
    officerClaimed: group.officerClaimed,
    provenCharacterIds: group.provenCharacterIds,
    createdAt,
  });
  return {
    officerClaimed: group.officerClaimed,
    pendingConfirmation: group.pendingConfirmation,
    provenCharacterIds: group.provenCharacterIds,
    readers: group.readers,
    confirmed,
    createdAt,
    conflicts: groupConflicts(after, new Date(c.now).toISOString()),
  };
}

async function recordedOutside(c: EditCtx, characterId: number): Promise<boolean> {
  const rows = col(c, OBSERVED).where('characterId', '==', characterId);
  try {
    const hit = await c.tx.get(rows.where('recordedCorporationId', '!=', c.corporationId).limit(1));
    return !hit.empty;
  } catch (e) {
    if (!isMissingIndex(e)) throw e;
    const all = await c.tx.get(rows.select('recordedCorporationId'));
    return all.docs.some((d) => d.get('recordedCorporationId') !== c.corporationId);
  }
}

async function recordedHereSince(
  c: EditCtx,
  characterId: number,
  fromDate: string
): Promise<boolean> {
  const rows = col(c, OBSERVED).where('characterId', '==', characterId);
  try {
    const hit = await c.tx.get(
      rows
        .where('recordedCorporationId', '==', c.corporationId)
        .where('date', '>=', fromDate)
        .limit(1)
    );
    return !hit.empty;
  } catch (e) {
    if (!isMissingIndex(e)) throw e;
    const all = await c.tx.get(rows.select('recordedCorporationId', 'date'));
    return all.docs.some(
      (d) => d.get('date') >= fromDate && d.get('recordedCorporationId') === c.corporationId
    );
  }
}

async function latestRecordedCorpOf(c: EditCtx, characterId: number): Promise<number | undefined> {
  const rows = col(c, OBSERVED).where('characterId', '==', characterId);
  const fields = ['characterId', 'recordedCorporationId', 'date', 'cachedAt', 'structureId'];
  let days: QueryDocumentSnapshot[];
  try {
    const top = await c.tx.get(rows.orderBy('date', 'desc').limit(1));
    if (top.empty) return undefined;
    days = (await c.tx.get(rows.where('date', '==', top.docs[0].get('date')))).docs;
  } catch (e) {
    if (!isMissingIndex(e)) throw e;
    days = (await c.tx.get(rows.select(...fields))).docs;
  }
  return latestRecordedCorp(days.map((d) => d.data() as CorpRecord)).get(characterId)?.corp;
}

async function rekeyAbsorbed(
  tx: Transaction,
  db: Firestore,
  corporationId: number,
  target: string,
  targetUids: readonly string[],
  absorbed: readonly string[]
): Promise<() => void> {
  if (absorbed.length === 0) return () => undefined;
  const at = (name: string) => sub(db, corporationId, name);
  const { records, existingDisputeIds } = await loadRekeyRecords(
    {
      read: async (collection, field, ids, also) => {
        let q = at(collection).where(field, 'in', ids);
        if (also) q = q.where(also[0], '==', also[1]);
        return (await tx.get(q)).docs.map((d) => ({ collection, id: d.id, data: d.data() }));
      },
      exists: async (collection, id) => (await tx.get(at(collection).doc(id))).exists,
    },
    target,
    absorbed
  );
  const writes = planRekey({ target, targetUids, records, existingDisputeIds });
  const ops = writes.reduce((n, w) => n + (w.kind === 'move' ? 2 : 1), absorbed.length + 1);
  if (ops > REGROUP_WRITE_CAP) tooManyToRegroup();
  return () => {
    for (const w of writes) {
      if (w.kind === 'update') tx.update(at(w.collection).doc(w.id), w.fields);
      else if (w.kind === 'delete') tx.delete(at(w.collection).doc(w.id));
      else {
        tx.set(at(w.collection).doc(w.toId), w.data);
        tx.delete(at(w.collection).doc(w.fromId));
      }
    }
  };
}

const REGROUP_WRITE_CAP = 450;
const tooManyToRegroup = (): never =>
  fail('failed-precondition', 'Too many records to move in one grouping', 'regroup-too-large');

function rekeyScope(
  action: { minerId: string; characterIds: number[] },
  absorbMinerIds: readonly string[],
  readers: readonly number[]
) {
  return {
    absorbed: absorbedMinerIds(action.minerId, action.characterIds, absorbMinerIds),
    uids: readers.map((x) => `char:${x}`),
  };
}

function groupResult(plan: GroupPlan) {
  return {
    pendingConfirmation: plan.pendingConfirmation,
    officerClaimed: plan.officerClaimed,
    conflicts: plan.conflicts,
  };
}

function writeMiner(
  c: EditCtx,
  action: { minerId: string; characterIds: number[]; mainCharacterId: number },
  plan: GroupPlan,
  aliases: readonly string[] = [],
  leftOn: Record<number, string> = {}
): void {
  clearAnswers(c, plan.officerClaimed);
  c.tx.set(col(c, MINERS).doc(action.minerId), {
    id: action.minerId,
    characterIds: action.characterIds,
    mainCharacterId: action.mainCharacterId,
    pendingConfirmation: plan.pendingConfirmation,
    officerClaimed: plan.officerClaimed,
    provenCharacterIds: plan.provenCharacterIds,
    confirmedCharacterIds: [...plan.confirmed].filter((x) => action.characterIds.includes(x)),
    createdAt: plan.createdAt,
    uids: plan.readers.map((x) => `char:${x}`),
    ...(aliases.length > 0 ? { aliases: [...aliases] } : {}),
    ...(Object.keys(leftOn).length > 0 ? { leftOn } : {}),
  });
}

function leftOnAfter(
  miners: readonly QueryDocumentSnapshot[],
  minerIds: readonly string[],
  characterIds: readonly number[]
): Record<number, string> {
  const kept: Record<number, string> = {};
  for (const d of miners)
    if (minerIds.includes(d.id))
      for (const [id, day] of Object.entries((d.get('leftOn') as Record<string, string>) ?? {}))
        if (!characterIds.includes(Number(id))) kept[Number(id)] = day;
  return kept;
}

function groupingChange(
  miners: readonly QueryDocumentSnapshot[],
  action: { minerId: string; characterIds: readonly number[] },
  absorbed: readonly string[]
): string[] {
  const holders = miners
    .filter((d) =>
      ((d.get('characterIds') as number[] | undefined) ?? []).some((x) =>
        action.characterIds.includes(x)
      )
    )
    .map((d) => d.id);
  return [action.minerId, ...holders].filter((id) => !absorbed.includes(id));
}

function aliasesAfter(
  miners: readonly QueryDocumentSnapshot[],
  target: string,
  absorbed: readonly string[]
): string[] {
  const of = (id: string) =>
    (miners.find((d) => d.id === id)?.get('aliases') as string[] | undefined) ?? [];
  return [...new Set([...of(target), ...absorbed.flatMap((id) => [id, ...of(id)])])].filter(
    (id) => id !== target
  );
}

function readersAfterUnlink(miner: Data, characterId: number): string[] {
  return minerReaderIds({
    characterIds: (miner.characterIds as number[]).filter((x) => x !== characterId),
    officerClaimed: miner.officerClaimed as number[] | undefined,
    pendingConfirmation: miner.pendingConfirmation as number[] | undefined,
  }).map((x) => `char:${x}`);
}

async function removeFromMiner(
  tx: Transaction,
  ref: DocumentReference,
  miner: Data,
  characterId: number,
  leftOn?: string
): Promise<boolean> {
  const before = miner.characterIds as number[];
  const characterIds = before.filter((x) => x !== characterId);
  if (characterIds.length === before.length) return false;
  const accounts = ref.parent.parent!.collection(RUNNING_ACCOUNTS);
  const dated = leftOn !== undefined && characterIds.length > 0;
  if (!dated) {
    const changed = characterIds.length > 1 ? [ref.id] : characterIds.map(soloMinerId);
    (await snapshotDropper(tx, accounts, [soloMinerId(characterId), ...changed]))();
  }
  if (!dated && characterIds.length <= 1) {
    tx.delete(ref);
    tx.delete(accounts.doc(ref.id));
  } else {
    tx.update(ref, {
      characterIds,
      mainCharacterId: characterIds.includes(miner.mainCharacterId as number)
        ? miner.mainCharacterId
        : characterIds[0],
      pendingConfirmation: (miner.pendingConfirmation as number[]).filter((x) => x !== characterId),
      officerClaimed: ((miner.officerClaimed as number[] | undefined) ?? []).filter(
        (x) => x !== characterId
      ),
      provenCharacterIds: ((miner.provenCharacterIds as number[] | undefined) ?? []).filter(
        (x) => x !== characterId
      ),
      confirmedCharacterIds: (miner.confirmedCharacterIds as number[]).filter(
        (x) => x !== characterId
      ),
      uids: readersAfterUnlink(miner, characterId),
      ...(dated ? { [`leftOn.${characterId}`]: leftOn } : {}),
    });
  }
  tx.set(
    ref.parent.parent!.collection(META).doc(DECLINED_DOC),
    { ids: FieldValue.arrayUnion(characterId) },
    { merge: true }
  );
  return true;
}

const othersOf = (miner: Data, characterId: number): number[] =>
  (miner.characterIds as number[]).filter((x) => x !== characterId);

const ANSWERS_DOC = 'groupingAnswers';

function recordAnswer(
  tx: Transaction,
  deps: BookDeps,
  corporationId: number,
  characterId: number,
  entry: {
    minerId: string;
    answer: 'confirmed' | 'declined';
    via: 'character' | 'verify-link';
    otherCharacterIds?: number[];
  }
): void {
  tx.set(
    sub(deps.db, corporationId, META).doc(ANSWERS_DOC),
    {
      answers: {
        [String(characterId)]: {
          ...entry,
          otherCharacterIds: entry.otherCharacterIds ?? FieldValue.delete(),
          at: new Date(deps.now()).toISOString(),
          dismissedAt: FieldValue.delete(),
        },
      },
    },
    { merge: true }
  );
}

export async function dismissGroupingAnswer(
  deps: BookDeps,
  caller: Caller,
  input: BookCall & { characterId: number }
): Promise<{ dismissedAt: string }> {
  await authorizeOfficer(deps, caller, input, 'edit', { live: false });
  const ref = sub(deps.db, input.corporationId, META).doc(ANSWERS_DOC);
  const key = String(input.characterId);
  return deps.db.runTransaction(async (tx) => {
    const entry = (await tx.get(ref)).get(new FieldPath('answers', key)) as Data | undefined;
    if (!entry) fail('not-found', 'No answer to dismiss', 'not-found');
    if (typeof entry.dismissedAt === 'string') return { dismissedAt: entry.dismissedAt };
    const dismissedAt = new Date(deps.now()).toISOString();
    tx.update(ref, new FieldPath('answers', key, 'dismissedAt'), dismissedAt);
    return { dismissedAt };
  });
}

function clearAnswers(c: EditCtx, characterIds: readonly number[]): void {
  if (characterIds.length === 0) return;
  c.tx.set(
    col(c, META).doc(ANSWERS_DOC),
    { answers: Object.fromEntries(characterIds.map((x) => [String(x), FieldValue.delete()])) },
    { merge: true }
  );
}

function keepInGroup(c: EditCtx, characterIds: readonly number[]): void {
  if (characterIds.length === 0) return;
  c.tx.set(
    col(c, META).doc(DECLINED_DOC),
    { ids: FieldValue.arrayRemove(...characterIds) },
    { merge: true }
  );
}

const RUNNING_ACCOUNT_FIGURES = [
  'owed',
  'paid',
  'days',
  'oldest',
  'paidThrough',
  'credit',
] as const;

function sameRunningAccount(
  stored: FirebaseFirestore.DocumentData | undefined,
  next: Record<string, unknown>
): boolean {
  return (
    !!stored &&
    RUNNING_ACCOUNT_FIGURES.every((k) => stored[k] === next[k]) &&
    JSON.stringify(stored.unpaidDays ?? null) === JSON.stringify(next.unpaidDays ?? null)
  );
}

async function storableSettledThrough(
  c: EditCtx,
  accounts: readonly { minerId: string; settledThrough?: string }[],
  paidRef: DocumentReference,
  iso: string
): Promise<Record<string, string>> {
  const asked = accounts.filter((a) => a.settledThrough !== undefined);
  if (asked.length === 0) return {};
  const stored = ((await c.tx.get(paidRef)).data()?.minerPaidThrough ?? {}) as Record<
    string,
    string
  >;
  const today = iso.slice(0, 10);
  const candidates = asked.filter(
    (a) =>
      a.settledThrough !== undefined &&
      a.settledThrough < today &&
      a.settledThrough > (stored[a.minerId] ?? '')
  );
  const heldFrom = new Map<string, string>();
  for (const ids of chunk(
    candidates.map((a) => a.minerId),
    30
  )) {
    for (const doc of (await c.tx.get(col(c, DISPUTES).where('minerId', 'in', ids))).docs) {
      const d = doc.data();
      if (!readHoldingDisputes([d]).some((h) => disputeHolds(h, iso))) continue;
      const held = d.date as string;
      if (held < (heldFrom.get(d.minerId) ?? '9999')) heldFrom.set(d.minerId, held);
    }
  }
  const out: Record<string, string> = {};
  for (const { minerId, settledThrough: day } of candidates)
    if (day !== undefined && day < (heldFrom.get(minerId) ?? '9999')) out[minerId] = day;
  return out;
}

const DAY_ON_NOTICE = 'day-on-statement';

async function checkRateStarts(c: EditCtx, newRates: readonly { effectiveFrom: string }[]) {
  const today = utcDay(c.now);
  if (!newRates.some((r) => r.effectiveFrom < today)) return;
  const last = lastNoticedDay(await readNotices(c.tx, bookOf(c)));
  for (const r of newRates) {
    const why = rateStartRefusal(r.effectiveFrom, today, last);
    if (why === 'too-old')
      fail('failed-precondition', 'A rate cannot start more than 30 days back', 'rate-too-old');
    if (why === 'on-statement')
      fail('failed-precondition', 'A Late notice already listed that day', DAY_ON_NOTICE);
  }
}

async function applyEdit(c: EditCtx, action: EditAction): Promise<EditOutcome> {
  const { tx, now } = c;
  const iso = new Date(now).toISOString();
  const by = c.access.characterId;
  const bookDoc = bookRef(c.deps.db, c.corporationId);
  const rates = (c.book.rates as StoredRate[] | undefined) ?? [];

  switch (action.action) {
    case 'addRate': {
      refuseLocked(now, action.rate.effectiveFrom);
      await checkRateStarts(c, [action.rate]);
      const next = [...rates.filter((r) => rateKey(r) !== rateKey(action.rate)), action.rate];
      if (next.length > 500) fail('resource-exhausted', 'Too many rates', 'too-many-rates');
      tx.update(bookDoc, { rates: next });
      return { detail: { rate: action.rate } };
    }
    case 'addRates': {
      refuseLocked(now, ...action.rates.map((r) => r.effectiveFrom));
      await checkRateStarts(c, action.rates);
      const keys = new Set(action.rates.map(rateKey));
      if (keys.size !== action.rates.length)
        fail('invalid-argument', 'Two of the rates are the same', 'duplicate-rate');
      const next = [...rates.filter((r) => !keys.has(rateKey(r))), ...action.rates];
      if (next.length > 500) fail('resource-exhausted', 'Too many rates', 'too-many-rates');
      tx.update(bookDoc, { rates: next });
      return {
        detail: {},
        audits: action.rates.map((rate) => ({ action: 'addRate', detail: { rate } })),
      };
    }
    case 'setRecordRate': {
      const { characterId, date } = parseRecordKey(action.recordKey);
      refuseLocked(now, date);
      const onChar = await readNotices(tx, bookOf(c), ofCharacterFilter(characterId));
      if (noticedDates(onChar, characterId).has(date)) {
        fail('failed-precondition', 'A Late notice already listed that day', DAY_ON_NOTICE);
      }
      const rate: StoredRate = { scope: 'record', recordKey: action.recordKey, pct: action.pct };
      tx.update(bookDoc, { rates: [...rates.filter((r) => rateKey(r) !== rateKey(rate)), rate] });
      return { detail: { recordKey: action.recordKey, pct: action.pct, reason: action.reason } };
    }
    case 'updateSettings': {
      if (action.patch.dismissApprovalAboveIsk !== undefined && !c.access.isDirector) {
        throw new HttpsError('permission-denied', 'Only a Director sets the approval limit', {
          reason: 'director-approval',
        });
      }
      const {
        structureExpiryHours,
        dismissApprovalAboveIsk,
        showToMembers,
        startDate,
        divisions,
        divisionsBase,
        addDivision,
        taxContact,
        ...rest
      } = action.patch;
      if ((startDate !== undefined || showToMembers) && !c.access.isDirector) {
        throw new HttpsError('permission-denied', 'Only a Director sets this', {
          reason: 'director-only',
        });
      }
      const update: Data = { ...rest };
      const storedDivisions = Array.isArray(c.book.divisions)
        ? (c.book.divisions as number[])
        : [...BOOK_DEFAULTS.divisions];
      if (addDivision !== undefined) {
        if (!storedDivisions.includes(addDivision)) {
          update.divisions = [...storedDivisions, addDivision].sort((a, b) => a - b);
        }
        if (rest.divisionNames) {
          update.divisionNames = {
            ...(c.book.divisionNames as Data | undefined),
            ...rest.divisionNames,
          };
        }
      } else if (divisions) {
        if (divisionsBase && !sameDivisions(divisionsBase, storedDivisions)) {
          fail(
            'failed-precondition',
            'The divisions changed since you opened the settings',
            'divisions-changed'
          );
        }
        update.divisions = divisions;
      }
      if (rest.primaryDivision !== undefined) {
        const reads = (update.divisions as number[] | undefined) ?? storedDivisions;
        if (!reads.includes(rest.primaryDivision)) {
          throw new HttpsError(
            'invalid-argument',
            'primaryDivision must be a division the book reads'
          );
        }
      }
      if (taxContact !== undefined) {
        update.taxContact = taxContact === null ? FieldValue.delete() : taxContact;
      }
      if (showToMembers) update.membersSeeFrom = now;
      const oldStart = c.book.startDate as string | undefined;
      if (startDate !== undefined && startDate !== oldStart) {
        refuseLocked(now, startDate, oldStart);
        const notices = await readNotices(tx, bookOf(c));
        const reason = startDateMoveReason(
          oldStart ?? startDate,
          startDate,
          utcDay(now),
          await ownBookFloor((r) => tx.get(r), c.deps.db, c.corporationId),
          notices
        );
        if (reason) fail('failed-precondition', 'The start date cannot move there', reason);
        update.startDate = startDate;
        if (oldStart && startDate < oldStart) {
          update.rates = moveStartRate(rates, oldStart, startDate);
        }
      }
      if (structureExpiryHours) {
        update.structureExpiryHours = {
          ...(c.book.structureExpiryHours as Data | undefined),
          ...structureExpiryHours,
        };
      }
      if (dismissApprovalAboveIsk !== undefined) {
        update.dismissApprovalAboveIsk =
          dismissApprovalAboveIsk === null ? FieldValue.delete() : dismissApprovalAboveIsk;
      }
      if (Object.keys(update).length > 0) tx.update(bookDoc, update);
      const audited =
        addDivision === undefined
          ? action.patch
          : { ...action.patch, divisions: update.divisions ?? storedDivisions };
      return { detail: { patch: audited as Data } };
    }
    case 'recordPayment': {
      refuseLocked(now, action.at);
      const ref = col(c, PAYMENTS).doc(action.paymentId);
      if ((await tx.get(ref)).exists)
        fail('already-exists', 'A payment with that id exists', 'payment-exists');
      const [fromSender, uncountedDoc] = await Promise.all([
        tx.get(col(c, PAYMENTS).where('characterId', '==', action.characterId)),
        tx.get(col(c, META).doc(UNCOUNTED_DOC)),
      ]);
      const sent: (Data & { id: string })[] = fromSender.docs.map((d) => ({
        ...d.data(),
        id: d.id,
      }));
      const same = handRecordMatch(action, {
        held: sent.filter((p) => p.source === 'donation') as never[],
        uncounted: (uncountedDoc.data()?.donations as UncountedDonation[] | undefined) ?? [],
      });
      if (same?.kind === 'held' || (same && sent.some((p) => p.transferId === same.id)))
        fail('already-exists', 'That transfer is already in the book', 'transfer-in-book');
      await requireOpenMiner(c, action.minerId);
      await confirmDeclaration(c, action.declarationId, action.minerId, action.paymentId);
      tx.create(ref, {
        id: action.paymentId,
        source: 'manual',
        minerId: action.minerId,
        characterId: action.characterId,
        uid: `char:${action.characterId}`,
        amount: action.amount,
        at: action.at,
        ...(same ? { transferId: same.id } : {}),
        ...(action.note ? { note: action.note } : {}),
        recordedBy: by,
      });
      return {
        detail: {
          paymentId: action.paymentId,
          minerId: action.minerId,
          amount: action.amount,
          ...(same ? { transferId: same.id } : {}),
          ...(action.declarationId ? { declarationId: action.declarationId } : {}),
        },
      };
    }
    case 'markNotTax': {
      const ref = col(c, PAYMENTS).doc(action.paymentId);
      const payment = await mustGet(c, ref, 'Payment');
      refuseLocked(now, payment.at);
      if (action.notTaxAmount > (payment.amount as number)) {
        fail('invalid-argument', 'More than the payment', 'not-tax-too-large');
      }
      if (action.notTaxAmount > ((payment.notTaxAmount as number | undefined) ?? 0))
        await releasePaidThrough(c, payment.minerId as string | undefined);
      tx.update(ref, {
        notTaxAmount: action.notTaxAmount,
        notTaxReason: action.reason ?? FieldValue.delete(),
        notTaxBy: by,
        notTaxAt: iso,
      });
      return {
        detail: {
          paymentId: action.paymentId,
          notTaxAmount: action.notTaxAmount,
          ...(action.reason ? { reason: action.reason } : {}),
        },
      };
    }
    case 'ignoreUncounted': {
      const ref = col(c, META).doc(UNCOUNTED_DOC);
      const held = (await tx.get(ref)).data();
      const donations = ((held?.donations as Data[] | undefined) ?? []).filter(
        (u) => u.id !== action.uncountedId
      );
      const ignored = [
        ...((held?.ignored as string[] | undefined) ?? []).filter(
          (id) => id !== action.uncountedId
        ),
        action.uncountedId,
      ].slice(-UNCOUNTED_IGNORED_MAX);
      tx.set(ref, { donations, ignored }, { merge: true });
      return { detail: { uncountedId: action.uncountedId } };
    }
    case 'assignPayment': {
      const ref = col(c, PAYMENTS).doc(action.paymentId);
      const payment = await mustGet(c, ref, 'Payment');
      if (payment.minerId !== undefined)
        fail('failed-precondition', 'Already assigned', 'already-assigned');
      refuseLocked(now, payment.at);
      await requireOpenMiner(c, action.minerId);
      await confirmDeclaration(c, action.declarationId, action.minerId, action.paymentId);
      tx.update(ref, { minerId: action.minerId, assignedBy: by, ...reviewDone(payment) });
      return {
        detail: {
          paymentId: action.paymentId,
          minerId: action.minerId,
          ...(action.declarationId ? { declarationId: action.declarationId } : {}),
        },
      };
    }
    case 'reassignPayment': {
      const ref = col(c, PAYMENTS).doc(action.paymentId);
      const payment = await mustGet(c, ref, 'Payment');
      const from = typeof payment.minerId === 'string' ? payment.minerId : null;
      if (from === action.minerId)
        return { detail: { paymentId: action.paymentId, from, to: from } };
      refuseLocked(now, payment.at);
      if (action.minerId !== null) await requireOpenMiner(c, action.minerId);
      await releasePaidThrough(c, from);
      tx.update(ref, {
        minerId: action.minerId ?? FieldValue.delete(),
        assignedBy: by,
        assignedAt: iso,
        ...reviewDone(payment),
      });
      return {
        detail: { paymentId: action.paymentId, from, to: action.minerId },
        result: { minerId: action.minerId },
      };
    }
    case 'dismiss': {
      if (
        dismissalNeedsDirector(
          c.book.dismissApprovalAboveIsk as number | null | undefined,
          [action.amountIsk],
          c.access.isDirector
        )
      ) {
        throw new HttpsError(
          'permission-denied',
          'A Director must approve this size of dismissal',
          { reason: 'director-approval' }
        );
      }
      const lockDate = lockDateFor(utcDay(now));
      if (action.scope === 'record') refuseLocked(now, parseRecordKey(action.targetId).date);
      if (action.scope === 'extraction') {
        const x = (await tx.get(col(c, EXTRACTIONS).doc(action.targetId))).data();
        const window =
          x &&
          pullWindow(
            x as MirrorExtraction,
            (c.book.structureExpiryHours as Record<string, number> | undefined) ?? {}
          );
        if (window) refuseLocked(now, window.to);
      }
      const id = `d${now}_${rand(4)}`;
      let uids: string[] = [];
      if (action.scope === 'record') {
        const characterId = Number(action.targetId.split(':')[0]);
        uids = Number.isSafeInteger(characterId) ? [`char:${characterId}`] : [];
      } else if (action.scope === 'miner') {
        const miner = (await tx.get(col(c, MINERS).doc(action.targetId))).data();
        uids = minerReaders(action.targetId, miner).map((id2) => `char:${id2}`);
      }
      tx.create(col(c, DISMISSALS).doc(id), {
        id,
        scope: action.scope,
        targetId: action.targetId,
        by,
        at: iso,
        reason: action.reason,
        uids,
        ...(action.scope !== 'record' ? { from: lockDate } : {}),
        ...(action.amountIsk !== undefined ? { amountIsk: action.amountIsk } : {}),
      });
      return {
        detail: {
          dismissalId: id,
          scope: action.scope,
          targetId: action.targetId,
          reason: action.reason,
        },
        result: { dismissalId: id },
      };
    }
    case 'dismissRecords': {
      const wanted = new Map<string, number>();
      for (const t of action.targets) {
        wanted.set(t.targetId, (wanted.get(t.targetId) ?? 0) + t.amountIsk);
      }
      const already = new Set<string>();
      const wantedIds = [...wanted.keys()];
      for (const ids of chunk(wantedIds, 30)) {
        const snap = await c.tx.get(col(c, DISMISSALS).where('targetId', 'in', ids));
        for (const d of snap.docs) {
          if (d.get('scope') === 'record' && !d.get('reversed')) already.add(d.get('targetId'));
        }
      }
      const targets = wantedIds
        .filter((id) => !already.has(id))
        .map((targetId) => ({ targetId, amountIsk: wanted.get(targetId) as number }));
      const skipped = wantedIds.filter((id) => already.has(id));
      if (targets.length === 0) {
        fail('failed-precondition', 'Those days are already dismissed', 'already-dismissed');
      }
      if (
        dismissalNeedsDirector(
          c.book.dismissApprovalAboveIsk as number | null | undefined,
          targets.map((t) => t.amountIsk),
          c.access.isDirector
        )
      ) {
        throw new HttpsError(
          'permission-denied',
          'A Director must approve this size of dismissal',
          { reason: 'director-approval' }
        );
      }
      refuseLocked(now, ...targets.map((t) => parseRecordKey(t.targetId).date));
      const ids: string[] = [];
      targets.forEach((target, i) => {
        const id = `d${now}_${i}_${rand(4)}`;
        const characterId = Number(target.targetId.split(':')[0]);
        tx.create(col(c, DISMISSALS).doc(id), {
          id,
          scope: 'record',
          targetId: target.targetId,
          by,
          at: iso,
          reason: action.reason,
          uids: Number.isSafeInteger(characterId) ? [`char:${characterId}`] : [],
          amountIsk: target.amountIsk,
        });
        ids.push(id);
      });
      return {
        detail: {
          dismissalIds: ids,
          days: targets.length,
          skipped,
          totalIsk: targets.reduce((sum, t) => sum + t.amountIsk, 0),
          reason: action.reason,
        },
        result: { dismissalIds: ids, skipped },
      };
    }
    case 'reverseDismissal': {
      const ref = col(c, DISMISSALS).doc(action.dismissalId);
      const dismissal = await mustGet(c, ref, 'Dismissal');
      if (dismissal.reversed) fail('failed-precondition', 'Already reversed', 'already-reversed');
      const wide = dismissal.scope !== 'record';
      if (!wide) refuseLocked(now, parseRecordKey(String(dismissal.targetId)).date);
      tx.update(ref, {
        reversed: {
          by,
          at: iso,
          reason: action.reason,
          ...(wide ? { from: lockDateFor(utcDay(now)) } : {}),
        },
      });
      return { detail: { dismissalId: action.dismissalId, reason: action.reason } };
    }
    case 'linkSurvey': {
      const ref = col(c, EXTRACTIONS).doc(action.extractionId);
      await mustGet(c, ref, 'Extraction');
      tx.update(ref, {
        surveyId: action.surveyId ?? FieldValue.delete(),
        surveyScan: action.surveyScan ?? FieldValue.delete(),
        popSurveyId: FieldValue.delete(),
      });
      return { detail: { extractionId: action.extractionId, surveyId: action.surveyId } };
    }
    case 'setFullyMined': {
      const ref = col(c, EXTRACTIONS).doc(action.extractionId);
      await mustGet(c, ref, 'Extraction');
      tx.update(ref, {
        fullyMined: action.fullyMined
          ? { by: by, byName: c.access.characterName, at: iso }
          : FieldValue.delete(),
      });
      return { detail: { extractionId: action.extractionId, fullyMined: action.fullyMined } };
    }
    case 'setMiner': {
      const miners = await tx.get(col(c, MINERS));
      const out = await planMiner(c, miners.docs, action, new Set());
      const scope = rekeyScope(action, [], out.readers);
      const changed = groupingChange(miners.docs, action, scope.absorbed);
      const rekey = await rekeyAbsorbed(
        tx,
        c.deps.db,
        c.corporationId,
        action.minerId,
        scope.uids,
        scope.absorbed
      );
      (await snapshotDropper(tx, col(c, RUNNING_ACCOUNTS), changed))();
      writeMiner(
        c,
        action,
        out,
        aliasesAfter(miners.docs, action.minerId, []),
        leftOnAfter(miners.docs, [action.minerId], action.characterIds)
      );
      rekey();
      keepInGroup(c, action.characterIds);
      return {
        detail: {
          minerId: action.minerId,
          characterIds: action.characterIds,
          officerClaimed: out.officerClaimed,
        },
        result: groupResult(out),
      };
    }
    case 'regroupMiner': {
      const miners = await tx.get(col(c, MINERS));
      const absorbed = new Set(action.absorbMinerIds);
      for (const id of absorbed) {
        const doc = miners.docs.find((d) => d.id === id);
        if (!doc) fail('not-found', 'Miner not found', 'not-found');
        const stray = (doc.data().characterIds as number[]).filter(
          (x) => !action.characterIds.includes(x)
        );
        if (stray.length > 0) {
          fail('invalid-argument', 'An absorbed Miner keeps a character out', 'regroup-incomplete');
        }
      }
      const out = await planMiner(c, miners.docs, action, absorbed);
      const scope = rekeyScope(action, action.absorbMinerIds, out.readers);
      const changed = groupingChange(miners.docs, action, scope.absorbed);
      const rekey = await rekeyAbsorbed(
        tx,
        c.deps.db,
        c.corporationId,
        action.minerId,
        scope.uids,
        scope.absorbed
      );
      (await snapshotDropper(tx, col(c, RUNNING_ACCOUNTS), changed))();
      for (const id of absorbed) tx.delete(col(c, MINERS).doc(id));
      writeMiner(
        c,
        action,
        out,
        aliasesAfter(miners.docs, action.minerId, action.absorbMinerIds),
        leftOnAfter(miners.docs, [action.minerId, ...action.absorbMinerIds], action.characterIds)
      );
      rekey();
      clearAnswers(
        c,
        action.characterIds.filter((x) => !out.confirmed.has(x))
      );
      keepInGroup(c, action.characterIds);
      return {
        detail: {
          minerId: action.minerId,
          characterIds: action.characterIds,
          absorbed: action.absorbMinerIds,
          officerClaimed: out.officerClaimed,
        },
        result: groupResult(out),
      };
    }
    case 'unlink': {
      const ref = col(c, MINERS).doc(action.minerId);
      const miner = await mustGet(c, ref, 'Miner');
      refuseLocked(now, action.leftOn);
      if (action.leftOn !== undefined && action.leftOn > utcDay(now))
        fail('invalid-argument', 'A character cannot leave in the future', 'future-left-on');
      if (!(await removeFromMiner(c.tx, ref, miner, action.characterId, action.leftOn)))
        fail('not-found', 'Not in that Miner', 'not-in-miner');
      clearAnswers(c, [action.characterId]);
      return { detail: { minerId: action.minerId, characterId: action.characterId } };
    }
    case 'addAdjustment': {
      refuseLocked(now, action.date);
      const id = `a${now}_${rand(4)}`;
      const uids = await minerUids(c, action.minerId);
      tx.create(col(c, ADJUSTMENTS).doc(id), {
        id,
        minerId: action.minerId,
        date: action.date,
        amount: action.amount,
        reason: action.reason,
        by,
        at: iso,
        uids,
        ...(action.kind === 'opening' ? { kind: 'opening' } : {}),
      });
      return {
        detail: {
          adjustmentId: id,
          minerId: action.minerId,
          amount: action.amount,
          reason: action.reason,
          ...(action.kind === 'opening' ? { kind: 'opening' } : {}),
        },
        result: { adjustmentId: id },
      };
    }
    case 'reverseAdjustment': {
      const ref = col(c, ADJUSTMENTS).doc(action.adjustmentId);
      const adjustment = await mustGet(c, ref, 'Adjustment');
      await assertAdjustmentReversible(c, action.adjustmentId, adjustment);
      requireDirectorAbove(c, [Math.abs(Number(adjustment.amount))]);
      refuseLocked(now, adjustment.date);
      tx.update(ref, { reversed: { by, at: iso, reason: action.reason } });
      return {
        detail: {
          adjustmentId: action.adjustmentId,
          minerId: adjustment.minerId,
          amount: adjustment.amount,
          reason: action.reason,
        },
      };
    }
    case 'editAdjustment': {
      const ref = col(c, ADJUSTMENTS).doc(action.adjustmentId);
      const adjustment = await mustGet(c, ref, 'Adjustment');
      await assertAdjustmentReversible(c, action.adjustmentId, adjustment);
      requireDirectorAbove(c, [Math.abs(action.amount - Number(adjustment.amount))]);
      const minerId = adjustment.minerId as string;
      const uids = await minerUids(c, minerId);
      const id = `a${now}_${rand(4)}`;
      refuseLocked(now, adjustment.date, action.date);
      tx.update(ref, { reversed: { by, at: iso, reason: `Edited: ${action.reason}` } });
      tx.create(col(c, ADJUSTMENTS).doc(id), {
        id,
        minerId,
        date: action.date,
        amount: action.amount,
        reason: action.reason,
        by,
        at: iso,
        uids,
        replaces: action.adjustmentId,
        ...(adjustment.kind === 'opening' ? { kind: 'opening' } : {}),
      });
      return {
        detail: {
          adjustmentId: id,
          replaces: action.adjustmentId,
          minerId,
          amount: action.amount,
          was: adjustment.amount,
          reason: action.reason,
        },
        result: { adjustmentId: id },
      };
    }
    case 'reverseWriteOff': {
      const ref = col(c, WRITE_OFFS).doc(action.writeOffId);
      const writeOff = await mustGet(c, ref, 'Write-off');
      if (writeOff.reversed) fail('failed-precondition', 'Already reversed', 'already-reversed');
      requireDirectorAbove(c, [Math.abs(Number(writeOff.amount))]);
      refuseLocked(now, writeOff.at);
      tx.update(ref, { reversed: { by, at: iso, reason: action.reason } });
      return {
        detail: {
          writeOffId: action.writeOffId,
          minerId: writeOff.minerId,
          amount: writeOff.amount,
          reason: action.reason,
        },
      };
    }
    case 'setToleranceExemption': {
      refuseLocked(now, action.date);
      if (action.forgive > 0) requireDirectorAbove(c, [action.forgive]);
      const uids = await minerUids(c, action.minerId);
      if (uids.length === 0) fail('not-found', 'Unknown Miner', 'unknown-miner');
      await releasePaidThrough(c, action.minerId, action.date);
      const id = `x${now}_${rand(4)}`;
      tx.create(col(c, TOLERANCE_EXEMPTIONS).doc(id), {
        id,
        minerId: action.minerId,
        date: action.date,
        forgive: action.forgive,
        reason: action.reason,
        by,
        at: iso,
        uids,
      });
      return {
        detail: {
          exemptionId: id,
          minerId: action.minerId,
          date: action.date,
          forgive: action.forgive,
          reason: action.reason,
        },
        result: { exemptionId: id },
      };
    }
    case 'writeOff': {
      const [disputes, live] = await Promise.all([
        c.tx.get(col(c, DISPUTES).where('minerId', '==', action.minerId)),
        liveRunningAccountOf(c, action.minerId),
      ]);
      const mineOpen = disputes.docs.map((d) => d.data()).filter(hasLines);
      const uids = await minerUids(c, action.minerId);
      const closing = disputesClosedByWriteOff(mineOpen, { amount: action.amount }, live);
      const id = `w${now}_${rand(4)}`;
      for (const disputeId of closing)
        tx.update(col(c, DISPUTES).doc(disputeId), {
          resolution: {
            kind: 'dismissed',
            at: iso,
            by,
            reason: action.reason,
            amountIsk: 0,
            writeOffId: id,
          },
        });
      tx.create(col(c, WRITE_OFFS).doc(id), {
        id,
        minerId: action.minerId,
        amount: action.amount,
        reason: action.reason,
        by,
        at: iso,
        uids,
      });
      return {
        detail: {
          writeOffId: id,
          minerId: action.minerId,
          amount: action.amount,
          reason: action.reason,
        },
        result: { writeOffId: id },
      };
    }
    case 'rebill': {
      refuseLocked(now, action.fromDate);
      const minerDoc = await tx.get(col(c, MINERS).doc(action.minerId));
      let touchesMember = false;
      for (const characterId of minerCharacters(action.minerId, minerDoc.data())) {
        if (await recordedHereSince(c, characterId, action.fromDate)) touchesMember = true;
      }
      if (touchesMember && !c.access.isDirector) {
        throw new HttpsError('permission-denied', 'Rebilling a member needs a Director', {
          reason: 'director-approval',
        });
      }
      const id = `r${now}_${rand(4)}`;
      tx.create(col(c, REBILLS).doc(id), {
        id,
        minerId: action.minerId,
        fromDate: action.fromDate,
        reason: action.reason,
        by,
        at: iso,
        memberRebill: touchesMember,
      });
      return {
        detail: {
          rebillId: id,
          minerId: action.minerId,
          fromDate: action.fromDate,
          reason: action.reason,
        },
        result: { rebillId: id },
      };
    }
    case 'issueLateNotice': {
      const { notice: sent } = action;
      const book = bookRef(c.deps.db, c.corporationId);
      const [miner, current] = await c.tx.getAll(
        col(c, MINERS).doc(sent.minerId),
        col(c, LATE_NOTICES).doc(sent.id)
      );
      if (miner.exists && miner.get('closedAt') != null)
        fail('failed-precondition', "This Miner's account is closed", 'account-closed');
      if (current.exists) fail('already-exists', 'A Late notice never changes', 'notice-exists');
      const refusal = lateNoticeRefusal(
        sent,
        await minerNotices(c, sent.minerId),
        (c.book.noticeRules as { cooldownDays?: number } | undefined)?.cooldownDays ??
          NOTICE_DEFAULTS.cooldownDays,
        iso
      );
      if (refusal === 'already-listed')
        fail('already-exists', 'Another notice already listed one of these days', refusal);
      if (refusal === 'notice-cooldown')
        fail('failed-precondition', 'This Miner was sent a notice too recently', refusal);
      const readers = minerReaders(sent.minerId, miner.data());
      const notice = {
        ...sent,
        uids: readers.map((x) => `char:${x}`),
        issuedBy: c.access.characterId,
      };
      const token = issueLateNoticeDocs(tx, c.deps.db, book, c.corporationId, notice, now);
      return {
        detail: { noticeId: notice.id, minerId: notice.minerId, listed: notice.listed },
        result: { noticeId: notice.id, verifyToken: token },
      };
    }
    case 'closeAccount':
      return closeAccount(c, action);
    case 'declare': {
      const notice = await mustGetNotice(c, action.noticeId);
      const id = `x${now}_${rand(4)}`;
      tx.create(col(c, DECLARATIONS).doc(id), {
        id,
        [NOTICE_ID_FIELD]: notice.id,
        kind: action.kind,
        at: iso,
        recordedBy: by,
        minerId: notice.minerId,
        uids: notice.uids,
        ...(action.note ? { note: action.note } : {}),
      });
      return {
        detail: { declarationId: id, noticeId: notice.id, kind: action.kind },
        result: { declarationId: id },
      };
    }
    case 'resolveDeclaration': {
      const ref = col(c, DECLARATIONS).doc(action.declarationId);
      const declaration = await mustGet(c, ref, 'Declaration');
      if (declaration.resolution)
        fail('failed-precondition', 'Already resolved', 'already-resolved');
      tx.update(ref, {
        resolution: {
          kind: action.resolution,
          at: iso,
          by,
          ...(action.reason ? { reason: action.reason } : {}),
          ...(action.nextStep ? { nextStep: action.nextStep } : {}),
        },
      });
      return {
        detail: {
          declarationId: action.declarationId,
          resolution: action.resolution,
          ...(action.reason ? { reason: action.reason } : {}),
        },
      };
    }
    case 'dismissDispute': {
      const ref = col(c, DISPUTES).doc(action.disputeId);
      const dispute = await mustGet(c, ref, 'Dispute');
      if (!hasLines(dispute)) fail('not-found', 'Dispute not found', 'not-found');
      if (dispute.resolution) fail('failed-precondition', 'Already resolved', 'already-resolved');
      if (dispute.minerId !== action.minerId)
        fail('invalid-argument', "Dispute is another Miner's", 'wrong-miner');
      const lines = (dispute.lines as DisputeConflictInput['lines'] | undefined) ?? [];
      const billing = [];
      for (const characterId of new Set(lines.map((l) => parseRecordKey(l.recordKey).characterId)))
        billing.push(...(await readNotices(tx, bookOf(c), ofCharacterFilter(characterId))));
      const priced = billedDisputeTax(
        {
          lines,
          ...(typeof dispute.kind === 'string' ? { kind: dispute.kind as DisputeKind } : {}),
          ...(typeof dispute.claimedPct === 'number' ? { claimedPct: dispute.claimedPct } : {}),
        },
        billing
      );
      const limit = c.book.dismissApprovalAboveIsk as number | null | undefined;
      if (priced === undefined && action.amountIsk === undefined)
        fail('failed-precondition', 'That ore is not billed yet', 'not-priced');
      if (priced !== undefined && !(priced > 0))
        fail('failed-precondition', 'The disputed ore carries no tax', 'nothing-to-waive');
      const amountIsk = priced ?? (action.amountIsk as number);
      if (dismissalNeedsDirector(limit, [priced], c.access.isDirector)) {
        throw new HttpsError(
          'permission-denied',
          'A Director must approve this size of dismissal',
          { reason: 'director-approval' }
        );
      }
      const uids = await minerUids(c, action.minerId);
      const id = `a${now}_${rand(4)}`;
      tx.create(col(c, ADJUSTMENTS).doc(id), {
        id,
        minerId: action.minerId,
        date: dispute.date,
        amount: -amountIsk,
        reason: action.reason,
        by,
        at: iso,
        uids,
        disputeId: action.disputeId,
      });
      tx.update(ref, {
        resolution: {
          kind: 'dismissed',
          at: iso,
          by,
          reason: action.reason,
          amountIsk,
          adjustmentId: id,
        },
      });
      return {
        detail: {
          disputeId: action.disputeId,
          adjustmentId: id,
          minerId: action.minerId,
          amountIsk,
          reason: action.reason,
        },
        result: { adjustmentId: id },
      };
    }
    case 'rejectDispute': {
      const ref = col(c, DISPUTES).doc(action.disputeId);
      const dispute = await mustGet(c, ref, 'Dispute');
      if (!hasLines(dispute)) fail('not-found', 'Dispute not found', 'not-found');
      if (dispute.resolution) fail('failed-precondition', 'Already resolved', 'already-resolved');
      const nextStep = action.nextStep !== undefined ? { nextStep: action.nextStep } : {};
      tx.update(ref, {
        resolution: { kind: 'rejected', at: iso, by, reason: action.reason, ...nextStep },
      });
      return { detail: { disputeId: action.disputeId, reason: action.reason, ...nextStep } };
    }
    case 'recordReminder': {
      const notice = await mustGetNotice(c, action.noticeId);
      const { mail } = notice;
      if (!reminderAllowed(mail))
        fail('failed-precondition', 'This miner stopped reminders', 'reminders-stopped');
      writeNoticeMail(tx, bookRef(c.deps.db, c.corporationId), notice, { kind: 'reminded' });
      return { detail: { noticeId: action.noticeId } };
    }
    case 'recordAccounts': {
      const paidRef = col(c, META).doc(PAID_DOC);
      const settled = await storableSettledThrough(c, action.accounts, paidRef, iso);
      const refs = action.accounts.map((a) => col(c, RUNNING_ACCOUNTS).doc(a.minerId));
      const stored = refs.length > 0 ? await c.tx.getAll(...refs) : [];
      const advanced = Object.keys(settled);
      const advancedUids = await Promise.all(advanced.map((id) => minerUids(c, id)));
      const today = utcDay(now);
      const fresh = new Map<number, { snapshot: Data; uids: string[] }>();
      const skipped: { minerId: string; through: string; reason: string }[] = [];
      for (const [i, { minerId, snapshot: k }] of action.accounts.entries()) {
        if (!k) continue;
        const known = await knownMiner(c, minerId);
        const reason = checkpointRefusal(k, {
          stored: stored[i].get('snapshot') as RunningAccountCheckpoint | undefined,
          today,
          known,
          characterIds: known
            ? minerCharacters(minerId, (await c.tx.get(col(c, MINERS).doc(minerId))).data())
            : [],
        });
        if (reason) skipped.push({ minerId, through: k.through, reason });
        else fresh.set(i, { snapshot: { ...k, at: iso, by }, uids: await minerUids(c, minerId) });
      }
      const written: string[] = [];
      action.accounts.forEach((account, i) => {
        const a = { ...account };
        delete a.settledThrough;
        delete a.snapshot;
        if (!fresh.has(i) && sameRunningAccount(stored[i].data(), a)) return;
        written.push(account.minerId);
        const { snapshot, uids }: Data = fresh.get(i) ?? stored[i].data() ?? {};
        const write = () =>
          tx.set(refs[i], { ...a, at: iso, by, ...(snapshot ? { snapshot, uids } : {}) });
        if (fresh.has(i)) write();
        else withoutVersionStamp(write);
      });
      if (Object.keys(settled).length > 0)
        tx.set(paidRef, { minerPaidThrough: settled }, { merge: true });
      advanced.forEach((id, i) =>
        tx.set(col(c, MINER_PAID).doc(id), { id, paidThrough: settled[id], uids: advancedUids[i] })
      );
      const skippedIds = skipped.map(({ minerId, reason }) => ({ minerId, reason }));
      const changed = written.length > 0 || skipped.length > 0 || advanced.length > 0;
      return {
        detail: { count: action.accounts.length, recorded: written, skipped: skippedIds },
        ...(changed ? {} : { audits: [] }),
        result: {
          recorded: [...fresh.keys()].map((i) => action.accounts[i].minerId),
          skipped: skippedIds,
        },
      };
    }
    case 'recordLateNoticeMail': {
      const { noticeId } = action;
      const notice = await mustGetNotice(c, noticeId);
      writeNoticeMail(tx, bookRef(c.deps.db, c.corporationId), notice, { kind: 'mailed', at: iso });
      return { detail: { noticeId, mailId: action.mailId, kind: action.kind } };
    }
    case 'setPopSharing':
    case 'setPopSharingMoon':
      return applyPopSharingEdit(c, action);
  }
}

async function applyPopSharingEdit(
  c: EditCtx,
  action: Extract<EditAction, { action: 'setPopSharing' | 'setPopSharingMoon' }>
): Promise<EditOutcome> {
  const ref = col(c, META).doc(POP_SHARING_DOC);
  const current = popSharingFrom((await c.tx.get(ref)).data());
  const next = { ...current, moons: { ...current.moons } };
  let detail: Data;
  const turningOn =
    action.action === 'setPopSharing' && action.enabled === true && !current.enabled;
  let editors: { characterId: number; ownerHash: string; at: number }[] = [];
  if (action.action === 'setPopSharing') {
    if (turningOn) {
      const sync = (await c.tx.get(col(c, META).doc(SCHEDULED_SYNC_DOC))).data();
      if (sync?.status !== 'active')
        fail('failed-precondition', 'Pop Sharing needs Automatic sync', 'needs-automatic-sync');
      editors = (await c.tx.get(col(c, OFFICERS))).docs.flatMap((d) => {
        const o = d.data() as Partial<OfficerAccess>;
        return o.canEdit === true &&
          typeof o.characterId === 'number' &&
          typeof o.ownerHash === 'string' &&
          typeof o.checkedAt === 'number' &&
          o.characterId !== c.access.characterId
          ? [{ characterId: o.characterId, ownerHash: o.ownerHash, at: o.checkedAt }]
          : [];
      });
      editors.push({ ...c.access, at: c.now });
    }
    if (action.enabled !== undefined) next.enabled = action.enabled;
    if (action.defaults) next.defaults = { ...current.defaults, ...action.defaults };
    detail = {
      ...(action.enabled === undefined ? {} : { enabled: action.enabled }),
      ...(action.defaults ? { defaults: action.defaults } : {}),
    };
  } else {
    const known = await c.tx.get(col(c, EXTRACTIONS).where('moonId', '==', action.moonId).limit(1));
    if (known.empty) fail('not-found', 'This book has no such moon', 'unknown-moon');
    const key = String(action.moonId);
    const override = applyMoonOverride(current.moons[key], action.override);
    if (override) next.moons[key] = override;
    else delete next.moons[key];
    detail = { moonId: action.moonId, set: action.override.set, clear: action.override.clear };
  }
  c.tx.set(ref, { ...next, updatedAt: c.now, updatedBy: c.access.characterId });
  for (const e of editors)
    c.tx.set(sharedPopSourcesRef(c.deps.db, c.corporationId), editorStampFields(e, e.at), {
      merge: true,
    });
  return { detail };
}

async function closeAccount(
  c: EditCtx,
  action: Extract<EditAction, { action: 'closeAccount' }>
): Promise<EditOutcome> {
  const { tx, now } = c;
  const iso = new Date(now).toISOString();
  const minerRef = col(c, MINERS).doc(action.minerId);
  const minerSnap = await tx.get(minerRef);
  if (minerSnap.exists && minerSnap.get('closedAt') != null)
    fail('failed-precondition', 'This account is already closed', 'already-closed');
  const characterIds = minerCharacters(action.minerId, minerSnap.data());
  if (characterIds.length === 0) fail('not-found', 'Miner not found', 'not-found');
  if (action.credit.kind === 'forfeit' && !forfeitAllowed(action.credit.basis, utcDay(now))) {
    fail(
      'failed-precondition',
      "Credit is forfeited only with the guest's consent or after 90 days with no reply",
      'forfeit-not-allowed'
    );
  }

  for (const characterId of characterIds) {
    const latest = await latestRecordedCorpOf(c, characterId);
    if (latest === c.corporationId)
      fail('failed-precondition', "Only a guest's account can be closed", 'not-a-guest');
  }

  const sent = action.notice;
  if (sent && sent.minerId !== action.minerId)
    fail('invalid-argument', "Notice is another Miner's", 'wrong-miner');
  if (sent && (await tx.get(col(c, LATE_NOTICES).doc(sent.id))).exists)
    fail('already-exists', 'A Late notice never changes', 'notice-exists');

  const credit = Math.max(0, action.runningCredit ?? 0);
  const owed = (await liveRunningAccountOf(c, action.minerId))?.owed ?? 0;

  const notice = sent && {
    ...sent,
    uids: minerReaders(action.minerId, minerSnap.data()).map((x) => `char:${x}`),
    issuedBy: c.access.characterId,
  };
  const token =
    notice && issueLateNoticeDocs(tx, c.deps.db, bookOf(c), c.corporationId, notice, now);
  const closeFields = {
    closedAt: iso,
    closedBy: c.access.characterId,
    closeReason: action.reason,
    closeCredit: {
      amount: credit,
      disposition: action.credit.kind,
      ...(action.credit.kind === 'forfeit' ? { basis: action.credit.basis } : {}),
    },
    ...(notice ? { finalStatementId: notice.id } : {}),
  };
  if (minerSnap.exists) {
    tx.update(minerRef, closeFields);
  } else {
    tx.set(minerRef, {
      id: action.minerId,
      characterIds,
      mainCharacterId: characterIds[0],
      pendingConfirmation: [],
      officerClaimed: [],
      provenCharacterIds: [],
      confirmedCharacterIds: [],
      uids: characterIds.map((x) => `char:${x}`),
      ...closeFields,
    });
  }
  return {
    detail: {
      minerId: action.minerId,
      reason: action.reason,
      ...(notice ? { noticeId: notice.id, listed: notice.listed } : {}),
      credit,
      disposition: action.credit.kind,
      owed,
      ...(action.credit.kind === 'forfeit' ? { basis: action.credit.basis } : {}),
    },
    result: { credit, owed, ...(notice ? { noticeId: notice.id, verifyToken: token } : {}) },
  };
}

export async function editBook(deps: BookDeps, caller: Caller, call: BookCall, action: EditAction) {
  const access = await authorizeOfficer(deps, caller, call, 'edit', {
    live: needsLiveCheck(action),
  });
  return editBookAs(deps, access, call, action);
}

async function refreshMoonDocsAfterEdit(
  db: Firestore,
  corporationId: number,
  action: EditAction
): Promise<void> {
  try {
    if (action.action === 'linkSurvey') {
      await refreshMoonDocs(db, corporationId, [action.extractionId]);
    } else if (
      (action.action === 'updateSettings' && action.patch.structureExpiryHours) ||
      action.action === 'setMiner' ||
      action.action === 'unlink' ||
      action.action === 'regroupMiner'
    ) {
      const snap = await sub(db, corporationId, EXTRACTIONS).get();
      await refreshMoonDocs(
        db,
        corporationId,
        snap.docs.map((d) => d.id)
      );
    }
  } catch (e) {
    console.error('moon docs refresh failed', e instanceof Error ? e.message : e);
  }
}

export async function editBookAs(
  deps: BookDeps,
  access: OfficerAccess,
  call: BookCall,
  action: EditAction,
  via?: string
) {
  const ref = bookRef(deps.db, call.corporationId);
  const result = await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('active') !== true)
      fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
    const ctx: EditCtx = {
      deps,
      tx,
      corporationId: call.corporationId,
      book: snap.data() as Data,
      access,
      now: deps.now(),
      released: new Set(),
    };
    const outcome = await applyEdit(ctx, action);
    applyReleasedPaidThrough(ctx);
    const actor = actorOf(access, via);
    for (const a of outcome.audits ?? [
      { action: action.action as AuditAction, detail: outcome.detail },
    ])
      appendAudit(tx, deps, call.corporationId, actor, a.action, a.detail);
    return outcome.result ?? {};
  });
  await refreshMoonDocsAfterEdit(deps.db, call.corporationId, action);
  if (movesReadModels(action)) await refreshReadModels(deps.db, call.corporationId, deps.now());
  if (action.action === 'updateSettings' && action.patch.structureExpiryHours) {
    await restampStructures(
      deps.db,
      call.corporationId,
      Object.keys(action.patch.structureExpiryHours).map(Number)
    ).catch((e) => console.error('expiry restamp failed', e instanceof Error ? e.message : e));
  }
  if (SHARED_POP_EDITS.has(action.action)) await refreshSharedPops(deps, call.corporationId);
  if (action.action === 'setMiner' || action.action === 'regroupMiner')
    await promoteProvenClaims(deps, call.corporationId).catch((e) =>
      console.error('claim promotion failed', e instanceof Error ? e.message : e)
    );
  return result;
}

const SHARED_POP_EDITS = new Set<EditAction['action']>([
  'setPopSharing',
  'setPopSharingMoon',
  'updateSettings',
  'addRate',
  'addRates',
  'linkSurvey',
]);

export async function confirmGrouping(
  deps: BookDeps,
  caller: Caller,
  corporationId: number,
  minerId: string
) {
  const characterId = signedInCharacter(caller);
  const ref = sub(deps.db, corporationId, MINERS).doc(minerId);
  await deps.db.runTransaction(async (tx) => {
    const miner = (await tx.get(ref)).data();
    if (!miner || !(miner.pendingConfirmation as number[]).includes(characterId)) {
      fail('not-found', 'Nothing to confirm', 'nothing-pending');
    }
    const rekey = await rekeyAbsorbed(
      tx,
      deps.db,
      corporationId,
      minerId,
      [...new Set([...((miner.uids as string[] | undefined) ?? []), caller.uid])],
      [soloMinerId(characterId)]
    );
    (await snapshotDropper(tx, ref.parent.parent!.collection(RUNNING_ACCOUNTS), [minerId]))();
    tx.update(ref, {
      pendingConfirmation: (miner.pendingConfirmation as number[]).filter((x) => x !== characterId),
      confirmedCharacterIds: FieldValue.arrayUnion(characterId),
      uids: FieldValue.arrayUnion(caller.uid),
    });
    rekey();
    recordAnswer(tx, deps, corporationId, characterId, {
      minerId,
      answer: 'confirmed',
      via: 'character',
    });
    appendAudit(tx, deps, corporationId, { characterId, name: '' }, 'confirmGrouping', { minerId });
  });
}

async function declinePending(
  deps: BookDeps,
  corporationId: number,
  minerId: string,
  characterId: number,
  actor: Actor
) {
  const ref = sub(deps.db, corporationId, MINERS).doc(minerId);
  await deps.db.runTransaction(async (tx) => {
    const miner = (await tx.get(ref)).data();
    if (!miner || !(miner.pendingConfirmation as number[]).includes(characterId)) {
      fail('not-found', 'Nothing to decline', 'nothing-pending');
    }
    if (miner.closedAt != null)
      fail('failed-precondition', "This Miner's account is closed", 'account-closed');
    const otherCharacterIds = othersOf(miner, characterId);
    await removeFromMiner(tx, ref, miner, characterId);
    recordAnswer(tx, deps, corporationId, characterId, {
      minerId,
      answer: 'declined',
      via: actor.via === 'verify-link' ? 'verify-link' : 'character',
      otherCharacterIds,
    });
    appendAudit(tx, deps, corporationId, actor, 'declineGrouping', { minerId, characterId });
  });
}

export async function declineGrouping(
  deps: BookDeps,
  caller: Caller,
  corporationId: number,
  minerId: string
) {
  const characterId = signedInCharacter(caller);
  await declinePending(deps, corporationId, minerId, characterId, { characterId, name: '' });
}

export async function declineLink(
  deps: BookDeps,
  caller: Caller,
  corporationId: number,
  minerId: string
) {
  const characterId = signedInCharacter(caller);
  const ref = sub(deps.db, corporationId, MINERS).doc(minerId);
  await deps.db.runTransaction(async (tx) => {
    const miner = (await tx.get(ref)).data();
    if (!miner || !(miner.characterIds as number[]).includes(characterId))
      fail('not-found', 'Nothing to decline', 'nothing-to-decline');
    if (miner.closedAt != null)
      fail('failed-precondition', "This Miner's account is closed", 'account-closed');
    const otherCharacterIds = othersOf(miner, characterId);
    await removeFromMiner(tx, ref, miner, characterId);
    recordAnswer(tx, deps, corporationId, characterId, {
      minerId,
      answer: 'declined',
      via: 'character',
      otherCharacterIds,
    });
    appendAudit(tx, deps, corporationId, { characterId, name: '' }, 'declineGrouping', {
      minerId,
      characterId,
      link: true,
    });
  });
  return { declined: true as const };
}

const PROMOTE_WRITE_CAP = 450;
const GROUP_CONFLICTS_DOC = 'groupConflicts';

export async function promoteProvenClaims(
  deps: BookDeps,
  corporationId: number
): Promise<{ promoted: number }> {
  const minersCol = sub(deps.db, corporationId, MINERS);
  const before = await minersCol.get();
  const claimed = [
    ...new Set(before.docs.flatMap((d) => (d.get('officerClaimed') as number[] | undefined) ?? [])),
  ];
  const stored = groupConflicts(
    before.docs.map((d) => claimMinerOf(d.id, d.data())),
    ''
  );
  if (claimed.length === 0 && stored.length === 0) return { promoted: 0 };
  const provenNow =
    claimed.length > 0 ? await provenCharacterIds(deps.db, claimed) : new Set<number>();
  if (provenNow.size === 0 && stored.length === 0) return { promoted: 0 };
  const conflictsRef = sub(deps.db, corporationId, META).doc(GROUP_CONFLICTS_DOC);
  let promoted = 0;
  await deps.db.runTransaction(async (tx) => {
    promoted = 0;
    const miners = (await tx.get(minersCol)).docs;
    const group = miners.map((d) => claimMinerOf(d.id, d.data()));
    const proven = await provenAmong(tx, deps.db, [...provenNow]);
    const plans = promoteClaims(group, proven);
    const held = (await tx.get(conflictsRef)).data();
    const widen: { ref: DocumentReference; uids: string[] }[][] = [];
    for (const p of plans) {
      const uids = p.characterIds.map((x) => `char:${x}`);
      const refs: { ref: DocumentReference; uids: string[] }[] = [];
      for (const name of [...MINER_KEYED.filter((n) => n !== PAYMENTS), DISPUTES]) {
        const snap = await tx.get(
          sub(deps.db, corporationId, name).where('minerId', '==', p.minerId)
        );
        for (const d of snap.docs) if ('uids' in d.data()) refs.push({ ref: d.ref, uids });
      }
      widen.push(refs);
    }
    const accounts = sub(deps.db, corporationId, RUNNING_ACCOUNTS);
    const dropSnapshot = await snapshotDropper(
      tx,
      accounts,
      plans.map((p) => p.minerId)
    );
    let budget = PROMOTE_WRITE_CAP;
    plans.forEach((p, i) => {
      if (widen[i].length + 1 > budget) return;
      budget -= widen[i].length + 1;
      const uids = p.characterIds.map((x) => `char:${x}`);
      tx.update(minersCol.doc(p.minerId), {
        officerClaimed: p.officerClaimed,
        provenCharacterIds: p.provenCharacterIds,
        uids: FieldValue.arrayUnion(...uids),
      });
      for (const w of widen[i]) tx.update(w.ref, { uids: FieldValue.arrayUnion(...w.uids) });
      dropSnapshot(p.minerId);
      promoted += p.characterIds.length;
    });
    const items = groupConflicts(group, new Date(deps.now()).toISOString()).map((x) => {
      const old = ((held?.items as GroupConflict[] | undefined) ?? []).find(
        (o) => o.characterId === x.characterId && o.minerIds.join() === x.minerIds.join()
      );
      return old ?? x;
    });
    const same = JSON.stringify(items) === JSON.stringify(held?.items ?? []);
    if (!same && (items.length > 0 || held)) tx.set(conflictsRef, { items });
  });
  return { promoted };
}

export async function declineGroupingByToken(deps: BookDeps, token: string, characterId: number) {
  const snap = await deps.db.collection(TOKENS_COLLECTION).doc(token).get();
  if (!snap.exists) fail('not-found', 'Verify link is not valid', 'invalid-token');
  const { corporationId, minerId } = snap.data() as { corporationId: number; minerId: string };
  await declinePending(deps, corporationId, minerId, characterId, {
    characterId: null,
    name: 'Miner (verify link)',
    via: 'verify-link',
  });
}

export async function listPendingGroupings(deps: BookDeps, caller: Caller) {
  const characterId = signedInCharacter(caller);
  const snap = await deps.db
    .collectionGroup(MINERS)
    .where('pendingConfirmation', 'array-contains', characterId)
    .get();
  const now = deps.now();
  const found = snap.docs.flatMap((d) => {
    const corporationId = Number(d.ref.parent.parent?.id);
    if (d.ref.parent.parent?.parent.id !== BOOKS_COLLECTION || !Number.isFinite(corporationId))
      return [];
    return [{ corporationId, minerId: d.id, mainCharacterId: d.get('mainCharacterId') as number }];
  });
  const books = new Map(
    await Promise.all(
      [...new Set(found.map((f) => f.corporationId))].map(
        async (id) => [id, (await bookRef(deps.db, id).get()).get('membersSeeFrom')] as const
      )
    )
  );
  return found.filter((f) => {
    const seeFrom = books.get(f.corporationId);
    return typeof seeFrom !== 'number' || now >= seeFrom;
  });
}

export async function claimPayment(
  deps: BookDeps,
  caller: Caller,
  corporationId: number,
  paymentId: string,
  options: { inReview?: boolean } = {}
) {
  const characterId = signedInCharacter(caller);
  const paymentRef = sub(deps.db, corporationId, PAYMENTS).doc(paymentId);
  return deps.db.runTransaction(async (tx) => {
    const book = await tx.get(bookRef(deps.db, corporationId));
    if (!book.exists || book.get('active') !== true)
      fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
    const snap = await tx.get(paymentRef);
    const payment = snap.data();
    if (!payment || payment.uid !== caller.uid) fail('not-found', 'Payment not found', 'not-found');
    if (payment.minerId !== undefined)
      fail('failed-precondition', 'Already assigned', 'already-assigned');
    if (((payment.notTaxAmount as number | undefined) ?? 0) >= (payment.amount as number))
      fail('failed-precondition', 'An officer marked this as not tax', 'not-tax');
    const inReview = payment.reviewReason !== undefined;
    if (inReview && (!options.inReview || payment.reviewReason !== 'no-open-balance'))
      fail('failed-precondition', 'An officer reviews this payment', 'in-review');
    if (inReview && String(payment.at ?? '').slice(0, 10) < String(book.get('startDate') ?? ''))
      fail('failed-precondition', 'Paid before the book started', 'before-start');
    refuseLocked(deps.now(), payment.at);
    const { minerId } = await callerMiner(tx, deps, corporationId, caller, characterId);
    tx.update(paymentRef, {
      minerId,
      claimedBy: characterId,
      claimedAt: new Date(deps.now()).toISOString(),
      ...(inReview ? { reviewReason: FieldValue.delete() } : {}),
    });
    appendAudit(
      tx,
      deps,
      corporationId,
      { characterId, name: 'Player claim', via: 'player-claim' },
      'claimPayment',
      { paymentId, minerId, ...(inReview ? { inReview: true } : {}) }
    );
    return { minerId };
  });
}

async function memberBook(tx: Transaction, deps: BookDeps, corporationId: number): Promise<void> {
  const book = await tx.get(bookRef(deps.db, corporationId));
  if (!book.exists || book.get('active') !== true)
    fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
  const seeFrom = book.get('membersSeeFrom') as unknown;
  if (typeof seeFrom === 'number' && deps.now() < seeFrom)
    fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
}

async function callerMiner(
  tx: Transaction,
  deps: BookDeps,
  corporationId: number,
  caller: Caller,
  characterId: number
): Promise<{ minerId: string; uids: string[] }> {
  const grouped = await tx.get(
    sub(deps.db, corporationId, MINERS).where('characterIds', 'array-contains', characterId)
  );
  const miner = grouped.docs.find((d) => (d.get('uids') as string[]).includes(caller.uid));
  return miner
    ? { minerId: miner.id, uids: miner.get('uids') as string[] }
    : { minerId: soloMinerId(characterId), uids: [caller.uid] };
}

export async function declareOwnPayment(deps: BookDeps, caller: Caller, input: DeclareOwnInput) {
  const characterId = signedInCharacter(caller);
  const { corporationId, noticeId } = input;
  const declared = await deps.db.runTransaction(async (tx) => {
    await memberBook(tx, deps, corporationId);
    const notice = await readLateNotice(tx, bookRef(deps.db, corporationId), noticeId);
    if (!notice || !notice.uids.includes(caller.uid))
      fail('not-found', 'Late notice not found', 'not-found');
    const minerDocs = (await tx.get(sub(deps.db, corporationId, MINERS))).docs;
    const grouping = minerDocs.map((d) => ({
      id: d.id,
      characterIds: (d.get('characterIds') as number[] | undefined) ?? [],
      ...(Array.isArray(d.get('aliases')) ? { aliases: d.get('aliases') as string[] } : {}),
      ...(typeof d.get('createdAt') === 'string'
        ? { createdAt: d.get('createdAt') as string }
        : {}),
    }));
    const minerId = currentMinerOf(notice.minerId, grouping);
    const senderIds =
      grouping.find((m) => m.id === minerId)?.characterIds ?? minerCharacters(minerId, undefined);
    const open = await tx.get(
      sub(deps.db, corporationId, DECLARATIONS).where(NOTICE_ID_FIELD, '==', noticeId)
    );
    if (open.docs.some((d) => d.get('resolution') === undefined))
      fail('already-exists', 'A declaration is already waiting', 'already-declared');
    const transfers = input.transfers ?? [];
    const checks =
      transfers.length > 0
        ? await checkTransfers(tx, deps, corporationId, senderIds, transfers)
        : ([] as ClaimCheck[]);
    const allFound = checks.length > 0 && checks.every((c) => c.result === 'found');
    const now = deps.now();
    const iso = new Date(now).toISOString();
    for (const c of checks) {
      if (c.result === 'found' && c.paymentId)
        tx.update(sub(deps.db, corporationId, PAYMENTS).doc(c.paymentId), {
          minerId,
          claimedBy: characterId,
          claimedAt: iso,
          reviewReason: FieldValue.delete(),
        });
    }
    const id = `x${now}_${rand(4)}`;
    tx.create(sub(deps.db, corporationId, DECLARATIONS).doc(id), {
      id,
      [NOTICE_ID_FIELD]: noticeId,
      kind: 'another-way',
      at: iso,
      recordedBy: characterId,
      via: 'player',
      minerId,
      uids: notice.uids,
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(transfers.length > 0 ? { transfers, checks } : {}),
      ...(allFound
        ? {
            resolution: {
              kind: 'confirmed',
              at: iso,
              by: 0,
              reason: "Found in the corporation's wallet",
            },
          }
        : {}),
    });
    appendAudit(
      tx,
      deps,
      corporationId,
      { characterId, name: 'Player declaration', via: 'player-claim' },
      'declare',
      {
        declarationId: id,
        noticeId,
        kind: 'another-way',
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
      }
    );
    return { declarationId: id, minerId, checks, confirmed: allFound };
  });
  return {
    declarationId: declared.declarationId,
    checks: declared.checks,
    confirmed: declared.confirmed,
  };
}

async function checkTransfers(
  tx: Transaction,
  deps: BookDeps,
  corporationId: number,
  senderIds: readonly number[],
  transfers: readonly ClaimTransfer[]
): Promise<ClaimCheck[]> {
  const book = (await tx.get(bookRef(deps.db, corporationId))).data() ?? {};
  const payments: (Data & { id: string })[] = [];
  for (const ids of chunk([...senderIds], IN_QUERY_LIMIT)) {
    const snap = await tx.get(
      sub(deps.db, corporationId, PAYMENTS).where('characterId', 'in', ids)
    );
    payments.push(...snap.docs.map((d) => ({ ...(d.data() as Data), id: d.id })));
  }
  const uncounted =
    ((await tx.get(sub(deps.db, corporationId, META).doc(UNCOUNTED_DOC))).data()?.donations as
      { characterId: number; amount: number; at: string; division: number }[] | undefined) ?? [];
  const lastSyncAt = (book.lastSync as { at?: number } | null | undefined)?.at;
  const today = utcDay(deps.now());
  return checkClaimedTransfers(transfers, {
    senderIds,
    payments: payments
      .filter((p) => typeof p.minerId === 'string' || !isLocked(p.at as string, today))
      .map((p) => ({
        id: p.id,
        characterId: p.characterId as number | undefined,
        amount: p.amount as number,
        at: p.at as string,
        ...(typeof p.minerId === 'string' ? { minerId: p.minerId } : {}),
        ...(typeof p.notTaxAmount === 'number' ? { notTaxAmount: p.notTaxAmount } : {}),
        ...(p.reviewReason !== undefined ? { reviewReason: String(p.reviewReason) } : {}),
      })),
    uncounted,
    lastSyncAt: typeof lastSyncAt === 'number' ? lastSyncAt : undefined,
    ...(typeof book.startDate === 'string' ? { startDate: book.startDate } : {}),
  });
}

export async function disputeConflict(deps: BookDeps, caller: Caller, input: DisputeConflictInput) {
  const characterId = signedInCharacter(caller);
  const { corporationId, date } = input;
  refuseLocked(deps.now(), date);
  const result = await deps.db.runTransaction(async (tx) => {
    await memberBook(tx, deps, corporationId);
    const { minerId, uids } = await callerMiner(tx, deps, corporationId, caller, characterId);
    const characters = new Set<number>();
    for (const line of input.lines) {
      const lineCharacter = parseRecordKey(line.recordKey).characterId;
      if (!uids.includes(`char:${lineCharacter}`))
        fail('permission-denied', 'Not your ore', 'not-your-record');
      characters.add(lineCharacter);
    }
    const disputeId = disputeIdFor(minerId, date);
    const ref = sub(deps.db, corporationId, DISPUTES).doc(disputeId);
    const stored = (await tx.get(ref)).data();
    const tombstone = stored !== undefined && !hasLines(stored);
    const answer = stored?.resolution as { kind?: string } | undefined;
    if (answer && answer.kind !== 'rejected')
      fail('failed-precondition', 'An officer answered this day', 'rejected');
    const again = answer !== undefined || tombstone;
    const held = again ? undefined : stored;
    if (held && ((held.kind as string | undefined) ?? 'payee') !== input.kind)
      fail('already-exists', 'This day already has a dispute', 'already-disputed');
    const heldLines = (held?.lines as DisputeConflictInput['lines'] | undefined) ?? [];
    for (const line of heldLines) characters.add(parseRecordKey(line.recordKey).characterId);
    const recorded: RecordedOre[] = [];
    for (const id of characters) {
      const rows = await tx.get(
        sub(deps.db, corporationId, OBSERVED)
          .where('characterId', '==', id)
          .where('date', '==', date)
      );
      for (const r of rows.docs) recorded.push(r.data() as RecordedOre);
    }
    const lines = mergeDisputeLines(heldLines, input.lines, recorded);
    const iso = new Date(deps.now()).toISOString();
    const said = {
      ...(input.kind !== 'payee' ? { kind: input.kind } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.claimedPct !== undefined ? { claimedPct: input.claimedPct } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    };
    if (held) {
      tx.update(ref, { lines, uids, updatedAt: iso, ...said });
    } else if (stored) {
      const past = tombstone
        ? undefined
        : {
            kind: (stored.kind as string | undefined) ?? 'payee',
            ...(typeof stored.reason === 'string' ? { reason: stored.reason } : {}),
            resolution: stored.resolution,
          };
      tx.set(ref, {
        id: disputeId,
        minerId,
        date,
        lines,
        by: characterId,
        at: iso,
        holdFrom:
          (stored.holdFrom as string | undefined) ?? (stored.at as string | undefined) ?? iso,
        updatedAt: iso,
        uids,
        history: [...((stored.history as unknown[] | undefined) ?? []), ...(past ? [past] : [])],
        ...said,
      });
    } else {
      tx.create(ref, {
        id: disputeId,
        minerId,
        date,
        lines,
        by: characterId,
        at: iso,
        updatedAt: iso,
        uids,
        ...said,
      });
    }
    appendAudit(
      tx,
      deps,
      corporationId,
      { characterId, name: 'Player dispute', via: 'player-claim' },
      'disputeConflict',
      { disputeId, minerId, date, kind: input.kind, lines: input.lines.length }
    );
    return { disputeId };
  });
  return result;
}

export async function withdrawDispute(deps: BookDeps, caller: Caller, input: WithdrawDisputeInput) {
  const characterId = signedInCharacter(caller);
  const { corporationId, date } = input;
  refuseLocked(deps.now(), date);
  const result = await deps.db.runTransaction(async (tx) => {
    await memberBook(tx, deps, corporationId);
    const { minerId } = await callerMiner(tx, deps, corporationId, caller, characterId);
    const disputeId = disputeIdFor(minerId, date);
    const ref = sub(deps.db, corporationId, DISPUTES).doc(disputeId);
    const held = (await tx.get(ref)).data();
    if (!held || held.minerId !== minerId || !hasLines(held))
      fail('not-found', 'Dispute not found', 'not-found');
    if (held.resolution) fail('failed-precondition', 'An officer answered this day', 'answered');
    tx.set(ref, {
      id: disputeId,
      minerId,
      date,
      uids: held.uids,
      holdFrom: (held.holdFrom as string | undefined) ?? (held.at as string),
      ...(Array.isArray(held.history) ? { history: held.history } : {}),
      withdrawnAt: new Date(deps.now()).toISOString(),
    });
    appendAudit(
      tx,
      deps,
      corporationId,
      { characterId, name: 'Player dispute withdrawal', via: 'player-claim' },
      'withdrawDispute',
      { disputeId, minerId, date }
    );
    return { disputeId };
  });
  return result;
}

async function noticeOfToken(
  reader: Pick<DocReader, 'getAll'>,
  book: DocumentReference,
  token: Data
): Promise<LateNotice | undefined> {
  const id = token[NOTICE_ID_FIELD];
  return typeof id === 'string' && id !== '' ? readLateNotice(reader, book, id) : undefined;
}

export async function readStatementByToken(deps: BookDeps, token: string) {
  const tokenSnap = await deps.db.collection(TOKENS_COLLECTION).doc(token).get();
  if (!tokenSnap.exists) fail('not-found', 'Verify link is not valid', 'invalid-token');
  const { corporationId, ...held } = tokenSnap.data() as { corporationId: number } & Data;
  const book = bookRef(deps.db, corporationId);
  const notice = await noticeOfToken(deps.db, book, held);
  if (!notice) fail('not-found', 'Verify link is not valid', 'invalid-token');
  const minerId = notice.minerId;
  const [bookSnap, notices, payments, declarations, miner, account] = await Promise.all([
    book.get(),
    readNotices(dbReader(deps.db), book, ofMinerFilter(minerId)),
    sub(deps.db, corporationId, PAYMENTS).where('minerId', '==', minerId).get(),
    sub(deps.db, corporationId, DECLARATIONS).where(NOTICE_ID_FIELD, '==', notice.id).get(),
    sub(deps.db, corporationId, MINERS).doc(minerId).get(),
    sub(deps.db, corporationId, RUNNING_ACCOUNTS).doc(minerId).get(),
  ]);
  const { hubId, oreForm } = notice.pricing ?? { hubId: 'jita', oreForm: 'compressed' };
  const shown = {
    id: notice.id,
    ...(notice.code ? { code: notice.code } : {}),
    issuedAt: notice.issuedAt,
    hubId,
    oreForm,
    amount: notice.listed,
    corporationName: notice.names?.corporationName,
    minerName: notice.names?.minerName,
    refineryNames: notice.names?.refineryNames,
    lines: notice.lines.map(({ key: _key, characterId: _characterId, ...line }) => {
      void _key;
      void _characterId;
      return line;
    }),
  };
  const b = bookSnap.data() ?? {};
  return {
    statement: shown,
    corporationId,
    terms: {
      hubId,
      oreForm,
      startDate: b.startDate,
      overdueDays: b.overdueDays,
      divisions: (b.divisions as number[] | undefined) ?? [1],
      divisionNames: b.divisionNames,
    },
    payments: [],
    settlement: null,
    declarations: declarations.docs.map((d) => {
      const x = d.data();
      return { kind: x.kind, at: x.at, resolution: x.resolution ?? null };
    }),
    settled: false,
    account: account.exists
      ? liveRunningAccount(
          account.data() as Data,
          payments.docs.map((d) => d.data()),
          dayTolerancePctOf(b)
        )
      : null,
    ledger: {
      days: ledgerDays(notices),
      payments: ledgerPayments(
        payments.docs.map((d) => ({ id: d.id, data: d.data() })),
        b.startDate as string | undefined
      ),
    },
    remindersStopped: notice.mail.remindersStopped,
    accountClosed: miner.exists && miner.get('closedAt') != null,
    pendingCharacterIds: miner.exists
      ? ((miner.get('pendingConfirmation') as number[] | undefined) ?? [])
      : [],
  };
}

export async function setRemindersByToken(deps: BookDeps, token: string, stopped: boolean) {
  const tokenRef = deps.db.collection(TOKENS_COLLECTION).doc(token);
  await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(tokenRef);
    if (!snap.exists) fail('not-found', 'Verify link is not valid', 'invalid-token');
    const { corporationId, minerId, ...held } = snap.data() as {
      corporationId: number;
      minerId: string;
    } & Data;
    const book = bookRef(deps.db, corporationId);
    const notice = await noticeOfToken(tx, book, held);
    if (!notice) fail('not-found', 'Verify link is not valid', 'invalid-token');
    tx.update(tokenRef, { remindersStopped: stopped });
    writeNoticeMail(tx, book, notice, { kind: 'remindersStopped', stopped });
    appendAudit(
      tx,
      deps,
      corporationId,
      { characterId: null, name: 'Miner (verify link)', via: 'verify-link' },
      'stopReminders',
      { noticeId: notice.id, minerId, stopped }
    );
  });
  return { stopped };
}
