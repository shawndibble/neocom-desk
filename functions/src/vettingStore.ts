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
// swept, and is not used once `VETTING_DRAFT_HOURS` old even if the daily sweep has not run
// yet; the review keeps the assessment, the parties it names and per-character summaries.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import {
  fail,
  requireLiveRoles,
  verifyAccessToken,
  verifyCallerToken,
  type Caller,
} from './actorAuth.js';
import type { EveTokenClaims } from './verifyEveToken.js';
import type { BookCall } from './corpTaxBook.js';
import type { PushSender } from './projectionStore.js';
import { deliverServerEvent } from './serverEventStore.js';
import type { SrpDeps } from './srpStore.js';
import { CORPS_COLLECTION } from './srpTypes.js';
import {
  addVettingInvite,
  appendVettingLog,
  applyVettingSettingsPatch,
  decideSignOff,
  draftExpiry,
  hasExpiredInputs,
  isExpiredDraft,
  isSubject,
  liveVettingInvite,
  nextDraftSlot,
  openExpiry,
  pilotStatus,
  readVettingSettings,
  recallTimed,
  referencedPartyIds,
  rememberTimed,
  reportCharacter,
  requestExpiry,
  reviewSummary,
  reviewView,
  seenVettingReviewer,
  shouldLogOpen,
  signOffsNeeded,
  unknownWatchName,
  vettingInviteOk,
  vettingSharedRecipients,
  wireSettings,
  withVettingInviteUsed,
  withoutCharacter,
  withoutInputs,
  withoutVettingInvite,
  type DraftThrottle,
  type TimedEntry,
} from './vettingDecide.js';
import {
  VETTING_MAX_CHARACTERS,
  assessVetting,
  settleVettingAnswers,
  unmetVettingMinimums,
  type VettingAnswer,
  type VettingCharacterInput,
  type VettingCorpInfo,
  type VettingOverview,
  type VettingParty,
  type VettingReview,
  type VettingStatus,
  type VettingWatchEntry,
} from './vettingEngine.js';
import type { VettingEsi } from './vettingEsi.js';
import {
  VETTING_INVITE_CODE_LENGTH,
  type VettingDecideInput,
  type VettingHandle,
  type VettingSettingsPatch,
  type VettingStartInput,
  type VettingSubmitInput,
} from './vettingParse.js';
import {
  HOUR_MS,
  VETTING_INPUTS,
  VETTING_MAX_READS,
  VETTING_REVIEWERS_DOC,
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
  /** Sends `vettingShared` to reviewers' devices (FCM in production). */
  push: PushSender;
  /** Where a push that could not be sent is noted; never the caller's problem. */
  logWarn?: (message: string, meta?: Record<string, unknown>) => void;
}

/** The in-game role that may read and sign off reviews, beside Director and the CEO. */
export const VETTING_REVIEWER_ROLE = 'Personnel_Manager';
/** The most reviews one overview returns; retention keeps a corp far below it. */
const OVERVIEW_LIMIT = 500;

const corpRef = (db: Firestore, corporationId: number) =>
  db.collection(CORPS_COLLECTION).doc(String(corporationId));
const settingsRef = (db: Firestore, corporationId: number) =>
  corpRef(db, corporationId).collection(VETTING_SETTINGS_COLLECTION).doc(VETTING_SETTINGS_DOC);
const reviewersRef = (db: Firestore, corporationId: number) =>
  corpRef(db, corporationId).collection(VETTING_SETTINGS_COLLECTION).doc(VETTING_REVIEWERS_DOC);
const reviewsOf = (db: Firestore, corporationId: number) =>
  corpRef(db, corporationId).collection(VETTING_REVIEWS);
const reviewRef = (db: Firestore, corporationId: number, reviewId: string) =>
  reviewsOf(db, corporationId).doc(reviewId);
const inputRef = (review: DocumentReference, characterId: number) =>
  review.collection(VETTING_INPUTS).doc(String(characterId));

// --- The pilot's key --------------------------------------------------------

const newReviewId = () => randomBytes(16).toString('base64url');
const newKey = () => randomBytes(32).toString('base64url');
/** 9 random bytes are 12 url-safe characters. */
const newInviteCode = () =>
  randomBytes(9).toString('base64url').slice(0, VETTING_INVITE_CODE_LENGTH);
const newQuestionId = () => randomBytes(6).toString('base64url');
const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

function keyMatches(keyHash: unknown, key: string): boolean {
  if (typeof keyHash !== 'string') return false;
  const held = Buffer.from(keyHash, 'hex');
  const given = createHash('sha256').update(key).digest();
  return held.length === given.length && timingSafeEqual(held, given);
}

/**
 * One answer for "no such review" and "wrong key", so a key cannot be probed for. A draft past
 * its time gets the same answer: the sweep that deletes it runs once a day, and until then it
 * must be as gone as it will be. `now` is null only for a withdraw, which deletes it anyway.
 */
function pilotReview(
  snap: { exists: boolean; data(): unknown },
  handle: VettingHandle,
  now: number | null
): StoredVettingReview {
  const review = snap.data() as StoredVettingReview | undefined;
  if (
    !snap.exists ||
    !review ||
    !keyMatches(review.keyHash, handle.key) ||
    (now !== null && isExpiredDraft(review, now))
  ) {
    fail('permission-denied', 'This review link is not valid', 'bad-key');
  }
  return review;
}

/**
 * Inside a transaction, before its other writes: what a member read into a request more than
 * `VETTING_DRAFT_HOURS` ago is deleted rather than used, as the sweep's `clear-inputs` would.
 */
async function dropExpiredInputs(
  tx: Transaction,
  ref: DocumentReference,
  review: StoredVettingReview,
  now: number
): Promise<StoredVettingReview> {
  if (!hasExpiredInputs(review, now)) return review;
  const held = await tx.get(ref.collection(VETTING_INPUTS));
  for (const doc of held.docs) tx.delete(doc.ref);
  const next = withoutInputs(review);
  tx.update(ref, { characters: next.characters, expiresAt: next.expiresAt });
  return next;
}

/** The pilot's review, with a request's expired reads already dropped. */
async function loadForPilot(
  deps: VettingDeps,
  handle: VettingHandle
): Promise<{ ref: DocumentReference; review: StoredVettingReview }> {
  const ref = reviewRef(deps.db, handle.corporationId, handle.reviewId);
  const now = deps.now();
  const review = pilotReview(await ref.get(), handle, now);
  if (!hasExpiredInputs(review, now)) return { ref, review };
  const dropped = await deps.db.runTransaction(async (tx) =>
    dropExpiredInputs(tx, ref, pilotReview(await tx.get(ref), handle, now), now)
  );
  return { ref, review: dropped };
}

const changed = (): never =>
  fail('aborted', 'The report changed while it was being checked; try again', 'changed');

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

const CORP_CACHE_MAX = 500;
const CORP_CACHE_MS = HOUR_MS;
/**
 * Public ESI names of corporations with no saved settings, null for one ESI does not know.
 * `getVettingCorp` is open to anyone, so without this each call for such a corporation would
 * be an ESI request. In memory, per function instance.
 */
const corpCache = new Map<number, TimedEntry<{ name: string; ticker: string } | null>>();

/** Test seam: forgets the cached public corp names. */
export function clearVettingCorpCache(): void {
  corpCache.clear();
}

/**
 * Public: what the apply page shows before any sign-in. `inviteOk` says only whether the code
 * sent is live; nothing else about a corp's invites leaves through here.
 */
export async function getVettingCorp(
  deps: VettingDeps,
  input: { corporationId: number; invite?: string }
): Promise<VettingCorpInfo> {
  const { corporationId } = input;
  // Read on every call: only the ESI name below is cached, never an answer about an invite.
  const settings = await loadSettings(deps, corporationId);
  const info = (corp: { name: string; ticker: string }): VettingCorpInfo => ({
    corporationId,
    name: corp.name,
    ticker: corp.ticker,
    on: settings.on,
    welcome: settings.welcome,
    minimums: settings.minimums,
    inviteOnly: settings.inviteOnly,
    inviteOk: vettingInviteOk(settings, input.invite),
  });
  if (settings.corporationName !== undefined && settings.corporationTicker !== undefined) {
    return info(await corpName(deps, corporationId, settings));
  }
  const now = deps.now();
  let found = recallTimed(corpCache, corporationId, now, CORP_CACHE_MS)?.value;
  if (found === undefined) {
    // A failed lookup throws and is not kept; "no such corporation" is.
    found = await deps.esi.corporation(corporationId);
    rememberTimed(corpCache, corporationId, found, now, CORP_CACHE_MAX);
  }
  if (!found) fail('not-found', 'No such corporation', 'unknown-corp');
  return info(found);
}

// --- Reading a character ----------------------------------------------------

interface CharacterRead {
  input: VettingCharacterInput;
  character: StoredVettingCharacter;
}

/** Reads the character of a verified token with it. The token goes no further. */
async function readVerified(
  deps: VettingDeps,
  claims: EveTokenClaims,
  accessToken: string
): Promise<CharacterRead> {
  const input = await deps.esi.readCharacter(claims.characterId, accessToken, claims.scopes);
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
      birthday: input.birthday,
      skillPoints: input.skillPoints,
      ownerHash: claims.ownerHash,
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

function requireInvite(settings: StoredVettingSettings, code: string | undefined): void {
  if (!vettingInviteOk(settings, code)) {
    fail(
      'permission-denied',
      'This corporation takes applications by invite only',
      'invite-required'
    );
  }
}

/**
 * Public: reads the token's character and opens a draft application. A live invite code is
 * recorded on it and counted, whether or not the corp is invite-only.
 */
export async function startVetting(
  deps: VettingDeps,
  input: VettingStartInput
): Promise<{ handle: VettingHandle; status: VettingStatus }> {
  const settings = await loadSettings(deps, input.corporationId);
  requireOn(settings);
  // Before the token is verified or anything is read: a link without a live invite gets no further.
  requireInvite(settings, input.invite);
  const claims = await verifyAccessToken(deps.verifyToken, input.accessToken);
  await takeDraftSlot(deps, input.corporationId, claims.characterId);
  const read = await readVerified(deps, claims, input.accessToken);
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
    answers: [],
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
  const settingsDoc = settingsRef(deps.db, input.corporationId);
  // One transaction: the invite is checked again as it is now (it may have been revoked while
  // the character was read) and its use is counted with the review it started.
  const made = await deps.db.runTransaction(async (tx) => {
    const current = readVettingSettings((await tx.get(settingsDoc)).data());
    requireInvite(current, input.invite);
    const invite = liveVettingInvite(current, input.invite);
    const next: StoredVettingReview = invite
      ? { ...review, invite: { code: invite.code, label: invite.label } }
      : review;
    if (invite) {
      tx.update(settingsDoc, { invites: withVettingInviteUsed(current, invite.code).invites });
    }
    tx.create(ref, next);
    tx.set(inputRef(ref, read.character.characterId), inputDoc(read));
    return { review: next, settings: current };
  });
  return {
    handle: { corporationId: input.corporationId, reviewId, key },
    status: pilotStatus(reviewId, made.review, made.settings, now),
  };
}

function requireRoom(review: StoredVettingReview, characterId: number): void {
  const held = review.characters.some((character) => character.characterId === characterId);
  if (!held && review.characters.length >= VETTING_MAX_CHARACTERS) {
    fail(
      'failed-precondition',
      `A report holds at most ${VETTING_MAX_CHARACTERS} characters`,
      'too-many-characters'
    );
  }
}

/**
 * Takes one of the review's `VETTING_MAX_READS` before the ESI read it pays for, in a
 * transaction, so calls made side by side cannot each see room and together pass the cap. A
 * read that then fails has still spent its slot.
 */
async function reserveRead(
  deps: VettingDeps,
  ref: DocumentReference,
  handle: VettingHandle,
  characterId: number
): Promise<void> {
  await deps.db.runTransaction(async (tx) => {
    const now = deps.now();
    const loaded = pilotReview(await tx.get(ref), handle, now);
    requireEditable(loaded);
    const review = await dropExpiredInputs(tx, ref, loaded, now);
    if (review.reads >= VETTING_MAX_READS) {
      fail('resource-exhausted', 'This report has been read too many times', 'rate-limited');
    }
    requireRoom(review, characterId);
    tx.update(ref, { reads: review.reads + 1 });
  });
}

/** Reads one more character into a draft or a request being answered; a re-read replaces it. */
export async function addVettingCharacter(
  deps: VettingDeps,
  input: VettingHandle & { accessToken: string }
): Promise<VettingStatus> {
  // The key, then the token (verified locally), then the limits: all before any ESI call is
  // spent on the caller.
  const { ref, review: before } = await loadForPilot(deps, input);
  requireEditable(before);
  const claims = await verifyAccessToken(deps.verifyToken, input.accessToken);
  await reserveRead(deps, ref, input, claims.characterId);
  const read = await readVerified(deps, claims, input.accessToken);
  const settings = await loadSettings(deps, input.corporationId);

  return deps.db.runTransaction(async (tx) => {
    const now = deps.now();
    const review = pilotReview(await tx.get(ref), input, now);
    requireEditable(review);
    // The reads already here went stale while this one was made: the next call drops them.
    if (hasExpiredInputs(review, now)) changed();
    requireRoom(review, read.character.characterId);
    const others = review.characters.filter(
      (character) => character.characterId !== read.character.characterId
    );
    const replaced = others.length !== review.characters.length;
    const next: StoredVettingReview = {
      ...review,
      // A re-read keeps the character's place in the list. `reads` was counted by `reserveRead`.
      characters: replaced
        ? review.characters.map((character) =>
            character.characterId === read.character.characterId ? read.character : character
          )
        : [...review.characters, read.character],
    };
    if (
      review.kind === 'application' &&
      (review.characters.length === 0 || review.pilot.characterId === read.character.characterId)
    ) {
      next.pilot = pilotOf(read.character);
    }
    if (review.state === 'requested' && review.characters.length === 0) {
      // What a member reads into a request is held no longer than a draft would be.
      next.expiresAt = Math.min(requestExpiry(review.createdAt), draftExpiry(now));
    }
    tx.set(ref, next);
    tx.set(inputRef(ref, read.character.characterId), inputDoc(read));
    return pilotStatus(input.reviewId, next, settings, now);
  });
}

export async function removeVettingCharacter(
  deps: VettingDeps,
  input: VettingHandle & { characterId: number }
): Promise<VettingStatus> {
  const ref = reviewRef(deps.db, input.corporationId, input.reviewId);
  const settings = await loadSettings(deps, input.corporationId);
  return deps.db.runTransaction(async (tx) => {
    const now = deps.now();
    const loaded = pilotReview(await tx.get(ref), input, now);
    requireEditable(loaded);
    const review = await dropExpiredInputs(tx, ref, loaded, now);
    const next = withoutCharacter(review, input.characterId);
    tx.set(ref, next);
    // Expired reads are all gone already, this character's among them.
    if (review === loaded) tx.delete(inputRef(ref, input.characterId));
    return pilotStatus(input.reviewId, next, settings, now);
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

/** What a submit must find unchanged: the reads taken, and which read of each character is held. */
const readsVersion = (review: StoredVettingReview): string =>
  [
    review.reads,
    ...review.characters.map((character) => `${character.characterId}@${character.readAt}`),
  ].join(',');

/**
 * What an application must bring before it is shared: an answer to each required question and
 * the corp's minimums, both as the settings stand now. Returns the answers to keep.
 */
function requireApplicationMet(
  settings: StoredVettingSettings,
  given: VettingSubmitInput['answers'],
  characters: VettingCharacterInput[],
  now: number
): VettingAnswer[] {
  const { answers, unanswered } = settleVettingAnswers(settings.questions, given);
  if (unanswered.length > 0) {
    fail('failed-precondition', 'Answer every required question first', 'answers-required');
  }
  const unmet = unmetVettingMinimums(settings.minimums, characters, now);
  // The message is the unmet minimums' ids, comma separated: the client shows which.
  if (unmet.length > 0) fail('failed-precondition', unmet.join(','), 'below-minimum');
  return answers;
}

/**
 * Tells the reviewers seen lately that a report was shared, on the devices that chose it. After
 * the submit has committed, and never its problem: a failure here is logged and swallowed.
 */
async function notifyShared(
  deps: VettingDeps,
  reviewId: string,
  review: StoredVettingReview
): Promise<void> {
  try {
    const now = deps.now();
    const known = (await reviewersRef(deps.db, review.corporationId).get()).data();
    await Promise.all(
      vettingSharedRecipients(known, review, now).map((characterId) =>
        deliverServerEvent(
          deps.db,
          deps.push,
          {
            eventId: 'vettingShared',
            characterId,
            corporationId: review.corporationId,
            reviewId,
            pilotName: review.pilot.name,
            kind: review.kind,
          },
          now,
          deps.logWarn
        )
      )
    );
  } catch (err) {
    deps.logWarn?.('vettingShared push failed', { error: String(err) });
  }
}

/**
 * Runs the checks, hands the report to the corp, and deletes what the reads returned. From here
 * the review waits `VETTING_OPEN_KEEP_DAYS` for a decision, and is deleted if none comes. An
 * application must first answer the corp's required questions and meet its minimums; a
 * promotion review is asked neither.
 */
export async function submitVetting(
  deps: VettingDeps,
  input: VettingSubmitInput
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
  // Before the checks spend any ESI call on a report that cannot be shared yet.
  const answers =
    before.kind === 'application'
      ? requireApplicationMet(settings, input.answers, characters, deps.now())
      : [];
  const { assessment, parties, kept } = await assess(deps, characters, settings.watchlist);
  const listed = new Map(before.characters.map((character) => [character.characterId, character]));

  const shared = await deps.db.runTransaction(async (tx) => {
    const now = deps.now();
    const review = pilotReview(await tx.get(ref), input, now);
    requireEditable(review);
    if (hasExpiredInputs(review, now) || readsVersion(review) !== readsVersion(before)) changed();
    const next: StoredVettingReview = {
      ...review,
      state: 'open',
      note: input.note,
      answers,
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
      // Shown to the pilot as the day the report goes if nobody decides; a decision resets both.
      deleteAt: openExpiry(now),
      expiresAt: openExpiry(now),
      log: appendVettingLog(review.log, {
        at: now,
        characterId: review.pilot.characterId,
        name: review.pilot.name,
        action: 'shared',
      }),
    };
    tx.set(ref, next);
    for (const doc of stored.docs) tx.delete(doc.ref);
    return next;
  });
  if (settings.notifyReviewers) await notifyShared(deps, input.reviewId, shared);
  return pilotStatus(input.reviewId, shared, settings, deps.now());
}

export async function getVettingStatus(
  deps: VettingDeps,
  handle: VettingHandle
): Promise<VettingStatus> {
  const [{ review }, settings] = await Promise.all([
    loadForPilot(deps, handle),
    loadSettings(deps, handle.corporationId),
  ]);
  return pilotStatus(handle.reviewId, review, settings, deps.now());
}

/**
 * Deletes the review and anything read into it, in any state: the report is the pilot's. One
 * transaction, so a character being added meanwhile cannot leave its `inputs` document behind
 * a deleted review: that add finds the review gone and fails.
 */
export async function withdrawVetting(
  deps: VettingDeps,
  handle: VettingHandle
): Promise<Record<string, never>> {
  const ref = reviewRef(deps.db, handle.corporationId, handle.reviewId);
  await deps.db.runTransaction(async (tx) => {
    pilotReview(await tx.get(ref), handle, null);
    const held = await tx.get(ref.collection(VETTING_INPUTS));
    for (const doc of held.docs) tx.delete(doc.ref);
    tx.delete(ref);
  });
  return {};
}

/** A member turns an officer's request down. The review stays, so reviewers see the answer. */
export async function declineVetting(
  deps: VettingDeps,
  handle: VettingHandle
): Promise<Record<string, never>> {
  const ref = reviewRef(deps.db, handle.corporationId, handle.reviewId);
  await deps.db.runTransaction(async (tx) => {
    const review = pilotReview(await tx.get(ref), handle, deps.now());
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
  const [found, settings] = await Promise.all([
    reviewsOf(deps.db, corporationId).where('pilot.characterId', '==', actor.characterId).get(),
    loadSettings(deps, corporationId),
  ]);
  const out: { handle: VettingHandle; status: VettingStatus }[] = [];
  for (const doc of found.docs) {
    if (doc.get('state') !== 'requested') continue;
    const key = newKey();
    const review = await deps.db.runTransaction(async (tx) => {
      const fresh = (await tx.get(doc.ref)).data() as StoredVettingReview | undefined;
      if (!fresh || fresh.state !== 'requested') return undefined;
      const current = await dropExpiredInputs(tx, doc.ref, fresh, deps.now());
      tx.update(doc.ref, { keyHash: hashKey(key) });
      return current;
    });
    if (review) {
      out.push({
        handle: { corporationId, reviewId: doc.id, key },
        status: pilotStatus(doc.id, review, settings, deps.now()),
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
    invites: settings.invites,
  };
}

/**
 * Notes that this caller held a reviewer role just now, so a shared report can find them
 * (`notifyShared`). At most one write a day per reviewer; a failure costs only a push.
 */
async function recordReviewer(
  deps: VettingDeps,
  corporationId: number,
  actor: VettingActor
): Promise<void> {
  const ref = reviewersRef(deps.db, corporationId);
  try {
    if (!seenVettingReviewer((await ref.get()).data(), actor.uid, actor.characterId, deps.now())) {
      return;
    }
    await deps.db.runTransaction(async (tx) => {
      const next = seenVettingReviewer(
        (await tx.get(ref)).data(),
        actor.uid,
        actor.characterId,
        deps.now()
      );
      if (next) tx.set(ref, next);
    });
  } catch (err) {
    deps.logWarn?.('vetting reviewer not recorded', { error: String(err) });
  }
}

export async function getVettingOverview(
  deps: VettingDeps,
  caller: Caller,
  call: BookCall
): Promise<VettingOverview> {
  const reviewer = await authorizeReviewer(deps, caller, call, 'review');
  const out = await overview(deps, call.corporationId, reviewer);
  await recordReviewer(deps, call.corporationId, reviewer.actor);
  return out;
}

/** Any reviewer hands out an apply link: a new invite, live until revoked. */
export async function createVettingInvite(
  deps: VettingDeps,
  caller: Caller,
  call: BookCall,
  input: { label: string }
): Promise<VettingOverview> {
  const reviewer = await authorizeReviewer(deps, caller, call, 'review');
  const ref = settingsRef(deps.db, call.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const out = addVettingInvite(await loadSettings(deps, call.corporationId, tx), {
      code: newInviteCode(),
      label: input.label,
      createdBy: { characterId: reviewer.actor.characterId, name: reviewer.actor.name },
      createdAt: deps.now(),
      uses: 0,
    });
    if (!out.ok) {
      fail('failed-precondition', 'Too many invites; revoke one first', out.reason);
    }
    // Merged: a corp that has saved no settings yet keeps none but the invite.
    tx.set(ref, { invites: out.settings.invites }, { merge: true });
  });
  return overview(deps, call.corporationId, reviewer);
}

/** Any reviewer revokes an invite. A code that is already gone is not an error. */
export async function revokeVettingInvite(
  deps: VettingDeps,
  caller: Caller,
  call: BookCall,
  input: { code: string }
): Promise<VettingOverview> {
  const reviewer = await authorizeReviewer(deps, caller, call, 'review');
  const ref = settingsRef(deps.db, call.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const settings = await loadSettings(deps, call.corporationId, tx);
    if (!liveVettingInvite(settings, input.code)) return;
    tx.set(ref, { invites: withoutVettingInvite(settings, input.code).invites }, { merge: true });
  });
  return overview(deps, call.corporationId, reviewer);
}

/** A review an officer may see: any but a draft, which is not with the corp yet. */
function officerReview(snap: { exists: boolean; data(): unknown }): StoredVettingReview {
  const review = snap.data() as StoredVettingReview | undefined;
  if (!snap.exists || !review || review.state === 'draft') {
    fail('not-found', 'No such review', 'not-found');
  }
  return review;
}

/**
 * Nobody reads the report about themselves, whatever their role: not the pilot, not a character
 * on it, not another character of an account one was read from. Signing it off is refused the
 * same way. (The requester of a promotion review is not its subject: they may read it, and are
 * `barred` from signing.) The queue still lists the row.
 */
function refuseOwnReview(review: StoredVettingReview, actor: VettingActor): void {
  if (isSubject(review, actor)) {
    fail('permission-denied', 'This review is about you', 'own-review');
  }
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
    refuseOwnReview(review, actor);
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
  barred: ['permission-denied', 'You asked for this review'],
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
    refuseOwnReview(review, actor);
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
      answers: [],
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
      added,
      newQuestionId
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
