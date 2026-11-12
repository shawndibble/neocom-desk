// Vetting: the admin-SDK half of the `vettingCall` actions. Parsing is in vettingParse.ts, the
// rules in vettingDecide.ts, the ESI reads in vettingEsi.ts, the layout in vettingTypes.ts.
// Clients have no read or write path to any of it (firestore.rules): everything a pilot or an
// officer sees comes back from one of these functions.
//
// Three kinds of caller:
//   - a pilot with no session: proven by the EVE access token they hand over (start, add) and
//     then by the review's secret `key`, returned once and stored only as a SHA-256 hash;
//   - a signed-in member answering a request: their own verified token;
//   - an officer: Director, CEO or Personnel_Manager, read live from ESI on every call. No
//     officer record is cached, because no client reads Firestore here.
//
// An access token is verified, used for the ESI read and dropped: never written or logged.
// What a read returned (`inputs`) is held only until the report is submitted, withdrawn or
// swept; the review keeps the assessment, the parties it names and per-character summaries.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import {
  fail,
  requireLiveRoles,
  verifyAccessToken,
  verifyCallerToken,
  type Caller,
} from './actorAuth.js';
import type { BookCall } from './corpTaxBook.js';
import type { SrpDeps } from './srpStore.js';
import { CORPS_COLLECTION } from './srpTypes.js';
import {
  appendVettingLog,
  applyVettingSettingsPatch,
  decideSignOff,
  draftExpiry,
  nextDraftSlot,
  pilotStatus,
  readVettingSettings,
  referencedPartyIds,
  reportCharacter,
  requestExpiry,
  reviewSummary,
  reviewView,
  shouldLogOpen,
  signOffsNeeded,
  unknownWatchName,
  wireSettings,
  withoutCharacter,
  type DraftThrottle,
} from './vettingDecide.js';
import {
  VETTING_MAX_CHARACTERS,
  assessVetting,
  type VettingCharacterInput,
  type VettingCorpInfo,
  type VettingOverview,
  type VettingParty,
  type VettingReview,
  type VettingStatus,
  type VettingWatchEntry,
} from './vettingEngine.js';
import type { VettingEsi } from './vettingEsi.js';
import type {
  VettingDecideInput,
  VettingHandle,
  VettingSettingsPatch,
  VettingStartInput,
} from './vettingParse.js';
import {
  VETTING_INPUTS,
  VETTING_MAX_READS,
  VETTING_REVIEWS,
  VETTING_SETTINGS_COLLECTION,
  VETTING_SETTINGS_DOC,
  VETTING_THROTTLE,
  type StoredVettingCharacter,
  type StoredVettingReview,
  type StoredVettingSettings,
  type VettingActor,
} from './vettingTypes.js';

export interface VettingDeps extends SrpDeps {
  esi: VettingEsi;
}

/** The in-game role that may read and sign off reviews, beside Director and the CEO. */
export const VETTING_REVIEWER_ROLE = 'Personnel_Manager';
/** The most reviews one overview returns; retention keeps a corp far below it. */
const OVERVIEW_LIMIT = 500;

const corpRef = (db: Firestore, corporationId: number) =>
  db.collection(CORPS_COLLECTION).doc(String(corporationId));
const settingsRef = (db: Firestore, corporationId: number) =>
  corpRef(db, corporationId).collection(VETTING_SETTINGS_COLLECTION).doc(VETTING_SETTINGS_DOC);
const reviewsOf = (db: Firestore, corporationId: number) =>
  corpRef(db, corporationId).collection(VETTING_REVIEWS);
const reviewRef = (db: Firestore, corporationId: number, reviewId: string) =>
  reviewsOf(db, corporationId).doc(reviewId);
const inputRef = (review: DocumentReference, characterId: number) =>
  review.collection(VETTING_INPUTS).doc(String(characterId));

// --- The pilot's key --------------------------------------------------------

const newReviewId = () => randomBytes(16).toString('base64url');
const newKey = () => randomBytes(32).toString('base64url');
const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

function keyMatches(keyHash: unknown, key: string): boolean {
  if (typeof keyHash !== 'string') return false;
  const held = Buffer.from(keyHash, 'hex');
  const given = createHash('sha256').update(key).digest();
  return held.length === given.length && timingSafeEqual(held, given);
}

/** One answer for "no such review" and "wrong key", so a key cannot be probed for. */
function pilotReview(
  snap: { exists: boolean; data(): unknown },
  handle: VettingHandle
): StoredVettingReview {
  const review = snap.data() as StoredVettingReview | undefined;
  if (!snap.exists || !review || !keyMatches(review.keyHash, handle.key)) {
    fail('permission-denied', 'This review link is not valid', 'bad-key');
  }
  return review;
}

async function loadForPilot(
  deps: VettingDeps,
  handle: VettingHandle
): Promise<{ ref: DocumentReference; review: StoredVettingReview }> {
  const ref = reviewRef(deps.db, handle.corporationId, handle.reviewId);
  return { ref, review: pilotReview(await ref.get(), handle) };
}

const EDITABLE = ['draft', 'requested'];

function requireEditable(review: StoredVettingReview): void {
  if (!EDITABLE.includes(review.state)) {
    fail('failed-precondition', 'This report has already been shared', 'wrong-state');
  }
}

// --- Settings and the corp --------------------------------------------------

async function loadSettings(
  deps: VettingDeps,
  corporationId: number,
  tx?: Transaction
): Promise<StoredVettingSettings> {
  const ref = settingsRef(deps.db, corporationId);
  return readVettingSettings((await (tx ? tx.get(ref) : ref.get())).data());
}

/** The corp's name and ticker: kept beside its settings, else from public ESI. */
async function corpName(
  deps: VettingDeps,
  corporationId: number,
  settings: StoredVettingSettings
): Promise<{ name: string; ticker: string }> {
  if (settings.corporationName !== undefined && settings.corporationTicker !== undefined) {
    return { name: settings.corporationName, ticker: settings.corporationTicker };
  }
  const found = await deps.esi.corporation(corporationId);
  if (!found) fail('not-found', 'No such corporation', 'unknown-corp');
  return found;
}

function requireOn(settings: StoredVettingSettings): void {
  if (!settings.on) {
    fail('failed-precondition', 'This corporation is not taking vetting reports', 'vetting-off');
  }
}

/** Public: what the apply page shows before any sign-in. */
export async function getVettingCorp(
  deps: VettingDeps,
  input: { corporationId: number }
): Promise<VettingCorpInfo> {
  const settings = await loadSettings(deps, input.corporationId);
  const { name, ticker } = await corpName(deps, input.corporationId, settings);
  return { corporationId: input.corporationId, name, ticker, on: settings.on };
}

// --- Reading a character ----------------------------------------------------

interface CharacterRead {
  input: VettingCharacterInput;
  character: StoredVettingCharacter;
}

/** Verifies the token and reads its character with it. The token goes no further. */
async function readCharacter(deps: VettingDeps, accessToken: string): Promise<CharacterRead> {
  const claims = await verifyAccessToken(deps.verifyToken, accessToken);
  return readVerified(deps, claims.characterId, claims.scopes, accessToken);
}

async function readVerified(
  deps: VettingDeps,
  characterId: number,
  scopes: readonly string[],
  accessToken: string
): Promise<CharacterRead> {
  const input = await deps.esi.readCharacter(characterId, accessToken, scopes);
  const [corporation] = await deps.esi.names([input.corporationId]);
  return {
    input,
    character: {
      characterId: input.characterId,
      name: input.name,
      corporationId: input.corporationId,
      corporationName: corporation?.name ?? '',
      missing: input.missing,
      readAt: deps.now(),
    },
  };
}

const pilotOf = (character: StoredVettingCharacter): StoredVettingReview['pilot'] => ({
  characterId: character.characterId,
  name: character.name,
  corporationName: character.corporationName,
});

/** The input document: one JSON string, so 5000 dealings cost no index entries. */
const inputDoc = (read: CharacterRead) => ({
  characterId: read.character.characterId,
  readAt: read.character.readAt,
  json: JSON.stringify(read.input),
});

/** Takes one of the character's daily draft slots in this corporation, or fails `rate-limited`. */
async function takeDraftSlot(
  deps: VettingDeps,
  corporationId: number,
  characterId: number
): Promise<void> {
  const ref = corpRef(deps.db, corporationId).collection(VETTING_THROTTLE).doc(String(characterId));
  const allowed = await deps.db.runTransaction(async (tx) => {
    const step = nextDraftSlot((await tx.get(ref)).data() as DraftThrottle | undefined, deps.now());
    if (step.allowed) tx.set(ref, step.state);
    return step.allowed;
  });
  if (!allowed) {
    fail(
      'resource-exhausted',
      'Too many reports started today; try again tomorrow',
      'rate-limited'
    );
  }
}

// --- The pilot --------------------------------------------------------------

/** Public: reads the token's character and opens a draft application. */
export async function startVetting(
  deps: VettingDeps,
  input: VettingStartInput
): Promise<{ handle: VettingHandle; status: VettingStatus }> {
  const settings = await loadSettings(deps, input.corporationId);
  requireOn(settings);
  const claims = await verifyAccessToken(deps.verifyToken, input.accessToken);
  await takeDraftSlot(deps, input.corporationId, claims.characterId);
  const read = await readVerified(deps, claims.characterId, claims.scopes, input.accessToken);
  const corp = await corpName(deps, input.corporationId, settings);

  const now = deps.now();
  const reviewId = newReviewId();
  const key = newKey();
  const review: StoredVettingReview = {
    corporationId: input.corporationId,
    corporationName: corp.name,
    corporationTicker: corp.ticker,
    state: 'draft',
    kind: 'application',
    pilot: pilotOf(read.character),
    keyHash: hashKey(key),
    note: '',
    characters: [read.character],
    reads: 1,
    reportCharacters: [],
    parties: [],
    assessment: null,
    signOffs: [],
    log: [
      {
        at: now,
        characterId: read.character.characterId,
        name: read.character.name,
        action: 'started',
      },
    ],
    signOffsNeeded: signOffsNeeded(settings, 'application'),
    createdAt: now,
    readAt: null,
    decidedAt: null,
    deleteAt: null,
    expiresAt: draftExpiry(now),
  };
  const ref = reviewRef(deps.db, input.corporationId, reviewId);
  const batch = deps.db.batch();
  batch.create(ref, review);
  batch.set(inputRef(ref, read.character.characterId), inputDoc(read));
  await batch.commit();
  return {
    handle: { corporationId: input.corporationId, reviewId, key },
    status: pilotStatus(reviewId, review),
  };
}

function requireRoom(review: StoredVettingReview, characterId?: number): void {
  if (review.reads >= VETTING_MAX_READS) {
    fail('resource-exhausted', 'This report has been read too many times', 'rate-limited');
  }
  const held = review.characters.some((character) => character.characterId === characterId);
  if (!held && review.characters.length >= VETTING_MAX_CHARACTERS) {
    fail(
      'failed-precondition',
      `A report holds at most ${VETTING_MAX_CHARACTERS} characters`,
      'too-many-characters'
    );
  }
}

/** Reads one more character into a draft or a request being answered; a re-read replaces it. */
export async function addVettingCharacter(
  deps: VettingDeps,
  input: VettingHandle & { accessToken: string }
): Promise<VettingStatus> {
  // The key and the limits are checked before any ESI call is spent on the caller.
  const { ref, review: before } = await loadForPilot(deps, input);
  requireEditable(before);
  requireRoom(before);
  const read = await readCharacter(deps, input.accessToken);

  return deps.db.runTransaction(async (tx) => {
    const review = pilotReview(await tx.get(ref), input);
    requireEditable(review);
    requireRoom(review, read.character.characterId);
    const others = review.characters.filter(
      (character) => character.characterId !== read.character.characterId
    );
    const replaced = others.length !== review.characters.length;
    const next: StoredVettingReview = {
      ...review,
      // A re-read keeps the character's place in the list.
      characters: replaced
        ? review.characters.map((character) =>
            character.characterId === read.character.characterId ? read.character : character
          )
        : [...review.characters, read.character],
      reads: review.reads + 1,
    };
    if (
      review.kind === 'application' &&
      (review.characters.length === 0 || review.pilot.characterId === read.character.characterId)
    ) {
      next.pilot = pilotOf(read.character);
    }
    if (review.state === 'requested' && review.characters.length === 0) {
      // What a member reads into a request is held no longer than a draft would be.
      next.expiresAt = Math.min(requestExpiry(review.createdAt), draftExpiry(deps.now()));
    }
    tx.set(ref, next);
    tx.set(inputRef(ref, read.character.characterId), inputDoc(read));
    return pilotStatus(input.reviewId, next);
  });
}

export async function removeVettingCharacter(
  deps: VettingDeps,
  input: VettingHandle & { characterId: number }
): Promise<VettingStatus> {
  const ref = reviewRef(deps.db, input.corporationId, input.reviewId);
  return deps.db.runTransaction(async (tx) => {
    const review = pilotReview(await tx.get(ref), input);
    requireEditable(review);
    const next = withoutCharacter(review, input.characterId);
    tx.set(ref, next);
    tx.delete(inputRef(ref, input.characterId));
    return pilotStatus(input.reviewId, next);
  });
}

function parseInput(json: unknown): VettingCharacterInput | undefined {
  if (typeof json !== 'string') return undefined;
  try {
    return JSON.parse(json) as VettingCharacterInput;
  } catch {
    return undefined;
  }
}

/**
 * Names and places everyone the characters dealt with, runs the checks, and returns the
 * assessment with only the parties its flags name (and their corporations and alliances).
 */
async function assess(
  deps: VettingDeps,
  characters: VettingCharacterInput[],
  watchlist: readonly VettingWatchEntry[]
) {
  const ids = new Set<number>();
  for (const character of characters) {
    ids.add(character.corporationId);
    for (const stay of character.history) ids.add(stay.corporationId);
    for (const dealing of character.dealings) ids.add(dealing.partyId);
  }
  const parties = new Map<number, VettingParty>(
    (await deps.esi.names([...ids])).map((party) => [party.id, party])
  );
  const people = [...parties.values()].filter((party) => party.category === 'character');
  for (const row of await deps.esi.affiliations(people.map((party) => party.id))) {
    const party = parties.get(row.characterId);
    if (!party) continue;
    party.corporationId = row.corporationId;
    if (row.allianceId !== undefined) party.allianceId = row.allianceId;
  }

  const assessment = assessVetting({
    now: deps.now(),
    characters,
    parties: [...parties.values()],
    watchlist: watchlist.map((entry) => entry.id),
  });

  const kept = new Map<number, VettingParty>();
  for (const id of referencedPartyIds(assessment)) {
    const party = parties.get(id);
    if (party) kept.set(id, party);
  }
  // A flagged character is on the report because of where it sits: name that too.
  const homes = new Set<number>();
  for (const party of kept.values()) {
    for (const home of [party.corporationId, party.allianceId]) {
      if (home !== undefined && !kept.has(home)) homes.add(home);
    }
  }
  const unnamed = [...homes].filter((id) => !parties.has(id));
  for (const party of await deps.esi.names(unnamed)) parties.set(party.id, party);
  for (const id of homes) {
    const party = parties.get(id);
    if (party) kept.set(id, party);
  }
  return { assessment, parties, kept: [...kept.values()] };
}

/** Runs the checks, hands the report to the corp, and deletes what the reads returned. */
export async function submitVetting(
  deps: VettingDeps,
  input: VettingHandle & { note: string }
): Promise<VettingStatus> {
  const { ref, review: before } = await loadForPilot(deps, input);
  requireEditable(before);
  const stored = await ref.collection(VETTING_INPUTS).get();
  const byId = new Map<number, VettingCharacterInput>();
  for (const doc of stored.docs) {
    const parsed = parseInput(doc.get('json'));
    if (parsed) byId.set(parsed.characterId, parsed);
  }
  const characters = before.characters.flatMap((character) => {
    const held = byId.get(character.characterId);
    return held ? [held] : [];
  });
  if (characters.length === 0) {
    fail('failed-precondition', 'Add a character before sharing the report', 'no-characters');
  }

  if (before.kind === 'promotion' && !byId.has(before.pilot.characterId)) {
    // The request was about this member: a report of other characters alone does not answer it.
    fail(
      'failed-precondition',
      `Add ${before.pilot.name} before sharing the report`,
      'pilot-missing'
    );
  }

  const settings = await loadSettings(deps, input.corporationId);
  const { assessment, parties, kept } = await assess(deps, characters, settings.watchlist);
  const listed = new Map(before.characters.map((character) => [character.characterId, character]));

  return deps.db.runTransaction(async (tx) => {
    const review = pilotReview(await tx.get(ref), input);
    requireEditable(review);
    if (review.reads !== before.reads || review.characters.length !== before.characters.length) {
      fail('aborted', 'The report changed while it was being checked; try again', 'changed');
    }
    const now = deps.now();
    const next: StoredVettingReview = {
      ...review,
      state: 'open',
      note: input.note,
      characters: review.characters.filter((character) => byId.has(character.characterId)),
      reportCharacters: characters.map((character) =>
        reportCharacter(
          character,
          parties.get(character.corporationId)?.name ??
            listed.get(character.characterId)?.corporationName ??
            ''
        )
      ),
      parties: kept,
      assessment,
      signOffsNeeded: signOffsNeeded(settings, review.kind),
      readAt: now,
      expiresAt: null,
      log: appendVettingLog(review.log, {
        at: now,
        characterId: review.pilot.characterId,
        name: review.pilot.name,
        action: 'shared',
      }),
    };
    tx.set(ref, next);
    for (const doc of stored.docs) tx.delete(doc.ref);
    return pilotStatus(input.reviewId, next);
  });
}

export async function getVettingStatus(
  deps: VettingDeps,
  handle: VettingHandle
): Promise<VettingStatus> {
  return pilotStatus(handle.reviewId, (await loadForPilot(deps, handle)).review);
}

/** Deletes the review and anything read into it, in any state: the report is the pilot's. */
export async function withdrawVetting(
  deps: VettingDeps,
  handle: VettingHandle
): Promise<Record<string, never>> {
  const { ref } = await loadForPilot(deps, handle);
  await deleteVettingReview(deps.db, ref);
  return {};
}

/** A review and its `inputs`, in one batch (at most `VETTING_MAX_CHARACTERS` + 1 writes). */
export async function deleteVettingReview(db: Firestore, ref: DocumentReference): Promise<void> {
  const batch = db.batch();
  for (const doc of await ref.collection(VETTING_INPUTS).listDocuments()) batch.delete(doc);
  batch.delete(ref);
  await batch.commit();
}

/** A member turns an officer's request down. The review stays, so reviewers see the answer. */
export async function declineVetting(
  deps: VettingDeps,
  handle: VettingHandle
): Promise<Record<string, never>> {
  const ref = reviewRef(deps.db, handle.corporationId, handle.reviewId);
  await deps.db.runTransaction(async (tx) => {
    const review = pilotReview(await tx.get(ref), handle);
    if (review.state !== 'requested') {
      fail('failed-precondition', 'There is no request to decline', 'wrong-state');
    }
    const held = await tx.get(ref.collection(VETTING_INPUTS));
    const next: StoredVettingReview = {
      ...review,
      state: 'declined',
      characters: [],
      expiresAt: requestExpiry(review.createdAt),
      log: appendVettingLog(review.log, {
        at: deps.now(),
        characterId: review.pilot.characterId,
        name: review.pilot.name,
        action: 'declined',
      }),
    };
    tx.set(ref, next);
    for (const doc of held.docs) tx.delete(doc.ref);
  });
  return {};
}

// --- A member answering a request -------------------------------------------

/**
 * The requests waiting for the caller's character in its current corporation. The member has
 * no key yet, so each one returned is given a fresh key here; an earlier handle stops working.
 */
export async function listMyVettingRequests(
  deps: VettingDeps,
  caller: Caller,
  input: { accessToken: string }
): Promise<{ handle: VettingHandle; status: VettingStatus }[]> {
  const actor = await verifyCallerToken(deps, caller, input.accessToken);
  const corporationId = await deps.lookupCorporation(actor.characterId);
  const found = await reviewsOf(deps.db, corporationId)
    .where('pilot.characterId', '==', actor.characterId)
    .get();
  const out: { handle: VettingHandle; status: VettingStatus }[] = [];
  for (const doc of found.docs) {
    if (doc.get('state') !== 'requested') continue;
    const key = newKey();
    const review = await deps.db.runTransaction(async (tx) => {
      const fresh = (await tx.get(doc.ref)).data() as StoredVettingReview | undefined;
      if (!fresh || fresh.state !== 'requested') return undefined;
      tx.update(doc.ref, { keyHash: hashKey(key) });
      return fresh;
    });
    if (review) {
      out.push({
        handle: { corporationId, reviewId: doc.id, key },
        status: pilotStatus(doc.id, review),
      });
    }
  }
  return out.sort((a, b) => a.status.id.localeCompare(b.status.id));
}

// --- Officers ---------------------------------------------------------------

interface Reviewer {
  actor: VettingActor;
  canConfigure: boolean;
}

/**
 * The caller as a reviewer, from ESI roles read now: a Director or the CEO (who may also
 * configure) or a Personnel_Manager. Nothing is cached, so a demotion takes effect at once.
 */
async function authorizeReviewer(
  deps: VettingDeps,
  caller: Caller,
  call: BookCall,
  need: 'review' | 'configure'
): Promise<Reviewer> {
  const verified = await verifyCallerToken(deps, caller, call.accessToken);
  const { identity, roles } = await requireLiveRoles(deps, verified, {
    corporationId: call.corporationId,
    // Personnel_Manager is not one of the decided roles, so the role is checked below.
    need: () => true,
    denied: { message: 'No reviewer role in this corporation', reason: 'not-a-reviewer' },
  });
  const canConfigure = roles.isDirector;
  if (!canConfigure && !identity.roles.includes(VETTING_REVIEWER_ROLE)) {
    fail('permission-denied', 'No reviewer role in this corporation', 'not-a-reviewer');
  }
  if (need === 'configure' && !canConfigure) {
    fail('permission-denied', 'This needs a Director or the CEO', 'role-required');
  }
  return {
    actor: {
      characterId: verified.characterId,
      name: verified.claims.name,
      uid: caller.uid,
      ownerHash: caller.ownerHash,
    },
    canConfigure,
  };
}

const SHOWN_STATES = ['requested', 'open', 'accepted', 'rejected', 'declined', 'withdrawn'];

async function overview(
  deps: VettingDeps,
  corporationId: number,
  reviewer: Reviewer
): Promise<VettingOverview> {
  const [settings, found] = await Promise.all([
    loadSettings(deps, corporationId),
    reviewsOf(deps.db, corporationId).where('state', 'in', SHOWN_STATES).get(),
  ]);
  return {
    settings: wireSettings(settings),
    canConfigure: reviewer.canConfigure,
    reviews: found.docs
      .map((doc) => reviewSummary(doc.id, doc.data() as StoredVettingReview, reviewer.actor))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, OVERVIEW_LIMIT),
  };
}

export async function getVettingOverview(
  deps: VettingDeps,
  caller: Caller,
  call: BookCall
): Promise<VettingOverview> {
  return overview(deps, call.corporationId, await authorizeReviewer(deps, caller, call, 'review'));
}

/** A review an officer may see: any but a draft, which is not with the corp yet. */
function officerReview(snap: { exists: boolean; data(): unknown }): StoredVettingReview {
  const review = snap.data() as StoredVettingReview | undefined;
  if (!snap.exists || !review || review.state === 'draft') {
    fail('not-found', 'No such review', 'not-found');
  }
  return review;
}

/** Opens a report. The pilot sees who opened it, so each open is logged (once an hour). */
export async function openVettingReview(
  deps: VettingDeps,
  caller: Caller,
  call: BookCall,
  input: { reviewId: string }
): Promise<VettingReview> {
  const { actor } = await authorizeReviewer(deps, caller, call, 'review');
  const ref = reviewRef(deps.db, call.corporationId, input.reviewId);
  return deps.db.runTransaction(async (tx) => {
    let review = officerReview(await tx.get(ref));
    const now = deps.now();
    if (shouldLogOpen(review.log, actor.characterId, now)) {
      const log = appendVettingLog(review.log, {
        at: now,
        characterId: actor.characterId,
        name: actor.name,
        action: 'opened',
      });
      review = { ...review, log };
      tx.update(ref, { log });
    }
    return reviewView(input.reviewId, review, actor);
  });
}

const REFUSAL = {
  'not-open': ['failed-precondition', 'This review is not waiting for a decision'],
  barred: ['permission-denied', 'You asked for this review, or it is about you'],
  'already-signed': ['already-exists', 'You have already signed this review off'],
} as const;

export async function decideVettingReview(
  deps: VettingDeps,
  caller: Caller,
  call: BookCall,
  input: VettingDecideInput
): Promise<VettingReview> {
  const { actor } = await authorizeReviewer(deps, caller, call, 'review');
  const ref = reviewRef(deps.db, call.corporationId, input.reviewId);
  return deps.db.runTransaction(async (tx) => {
    const review = officerReview(await tx.get(ref));
    const out = decideSignOff(review, actor, input.decision, input.note, deps.now());
    if (!out.ok) {
      const [code, message] = REFUSAL[out.reason];
      return fail(code, message, out.reason);
    }
    tx.set(ref, out.review);
    return reviewView(input.reviewId, out.review, actor);
  });
}

/** Asks a member for a review before a promotion. The member answers from their own session. */
export async function requestVettingReview(
  deps: VettingDeps,
  caller: Caller,
  call: BookCall,
  input: { memberName: string; role: string }
): Promise<VettingOverview> {
  const reviewer = await authorizeReviewer(deps, caller, call, 'review');
  const settings = await loadSettings(deps, call.corporationId);
  requireOn(settings);

  const wanted = input.memberName.toLowerCase();
  const member = (await deps.esi.ids([input.memberName])).find(
    (entry) => entry.category === 'character' && entry.name.toLowerCase() === wanted
  );
  if (!member) {
    fail('not-found', `No character is named "${input.memberName}"`, 'unknown-name');
  }
  if ((await deps.lookupCorporation(member.id)) !== call.corporationId) {
    fail('failed-precondition', `${member.name} is not in this corporation`, 'not-a-member');
  }
  const corp = await corpName(deps, call.corporationId, settings);

  const reviews = reviewsOf(deps.db, call.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const held = await tx.get(reviews.where('pilot.characterId', '==', member.id));
    const waiting = held.docs.some(
      (doc) =>
        doc.get('kind') === 'promotion' &&
        ['requested', 'open'].includes(doc.get('state') as string)
    );
    if (waiting) {
      fail('already-exists', `${member.name} already has a review waiting`, 'already-requested');
    }
    const now = deps.now();
    const review: StoredVettingReview = {
      corporationId: call.corporationId,
      corporationName: corp.name,
      corporationTicker: corp.ticker,
      state: 'requested',
      kind: 'promotion',
      ...(input.role ? { role: input.role } : {}),
      pilot: { characterId: member.id, name: member.name, corporationName: corp.name },
      requestedBy: reviewer.actor,
      keyHash: null,
      note: '',
      characters: [],
      reads: 0,
      reportCharacters: [],
      parties: [],
      assessment: null,
      signOffs: [],
      log: [
        {
          at: now,
          characterId: reviewer.actor.characterId,
          name: reviewer.actor.name,
          action: 'requested',
        },
      ],
      signOffsNeeded: signOffsNeeded(settings, 'promotion'),
      createdAt: now,
      readAt: null,
      decidedAt: null,
      deleteAt: null,
      expiresAt: requestExpiry(now),
    };
    tx.create(reviews.doc(newReviewId()), review);
  });
  return overview(deps, call.corporationId, reviewer);
}

export async function saveVettingSettings(
  deps: VettingDeps,
  caller: Caller,
  call: BookCall,
  patch: VettingSettingsPatch
): Promise<VettingOverview> {
  const reviewer = await authorizeReviewer(deps, caller, call, 'configure');
  const added = patch.addWatchNames.length > 0 ? await deps.esi.ids(patch.addWatchNames) : [];
  const unknown = unknownWatchName(patch.addWatchNames, added);
  if (unknown !== undefined) {
    fail(
      'not-found',
      `No character, corporation or alliance is named "${unknown}"`,
      'unknown-name'
    );
  }
  const corp = await corpName(
    deps,
    call.corporationId,
    await loadSettings(deps, call.corporationId)
  );

  const ref = settingsRef(deps.db, call.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const out = applyVettingSettingsPatch(
      await loadSettings(deps, call.corporationId, tx),
      patch,
      added
    );
    if (!out.ok) {
      fail('failed-precondition', 'The watchlist is full; remove an entry first', out.reason);
    }
    tx.set(ref, {
      ...out.settings,
      corporationName: corp.name,
      corporationTicker: corp.ticker,
    });
  });
  return overview(deps, call.corporationId, reviewer);
}
