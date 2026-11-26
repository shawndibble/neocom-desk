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
import {
  decodeRawCursor,
  encodeRawCursor,
  rawChunkId,
  rawChunkIdsOf,
  sumRawCounts,
} from './vettingRawChunks.js';
import {
  keptRaw,
  pageOfChunk,
  prepareRaw,
  pruneRaw,
  rawPagePosition,
  tidyRaw,
  tidyRawIds,
  writeRaw,
  type PreparedRaw,
} from './vettingRawStore.js';
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
  recordRequestMail,
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
  VETTING_DEFAULT_SETTINGS,
  VETTING_MAX_CHARACTERS,
  assessVetting,
  settleVettingAnswers,
  unmetVettingMinimums,
  type VettingAnswer,
  type VettingCharacterInput,
  type VettingCorpInfo,
  type VettingOverview,
  type VettingParty,
  type VettingRawPage,
  type VettingReview,
  type VettingStatus,
  type VettingWatchEntry,
} from './vettingEngine.js';
import type { VettingEsi } from './vettingEsi.js';
import {
  VETTING_INVITE_CODE_LENGTH,
  type VettingDecideInput,
  type VettingHandle,
  type VettingRawRowsInput,
  type VettingSettingsPatch,
  type VettingStartInput,
  type VettingSubmitInput,
} from './vettingParse.js';
import {
  VETTING_INPUTS,
  VETTING_MAX_READS,
  VETTING_RAW,
  VETTING_NOTIFY_BUDGET_MS,
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
import { HOUR_MS } from './timeConstants.js';

export interface VettingDeps extends SrpDeps {
  esi: VettingEsi;
  push: PushSender;
  logWarn?: (message: string, meta?: Record<string, unknown>) => void;
  notifyBudgetMs?: number;
  rawChunkBytes?: number;
}

export const VETTING_REVIEWER_ROLE = 'Personnel_Manager';
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

const newReviewId = () => randomBytes(16).toString('base64url');
const newKey = () => randomBytes(32).toString('base64url');
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
  await tidyRaw(ref, new Map(), deps.logWarn);
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

async function loadSettings(
  deps: VettingDeps,
  corporationId: number,
  tx?: Transaction
): Promise<StoredVettingSettings> {
  const ref = settingsRef(deps.db, corporationId);
  return readVettingSettings((await (tx ? tx.get(ref) : ref.get())).data());
}

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
const corpCache = new Map<number, TimedEntry<{ name: string; ticker: string } | null>>();

export function clearVettingCorpCache(): void {
  corpCache.clear();
}

export async function getVettingCorp(
  deps: VettingDeps,
  input: { corporationId: number; invite?: string }
): Promise<VettingCorpInfo> {
  const { corporationId } = input;
  const settings = await loadSettings(deps, corporationId);
  const inviteOk = vettingInviteOk(settings, input.invite);
  const shown = inviteOk ? settings : VETTING_DEFAULT_SETTINGS;
  const info = (corp: { name: string; ticker: string }): VettingCorpInfo => ({
    corporationId,
    name: corp.name,
    ticker: corp.ticker,
    on: settings.on,
    welcome: shown.welcome,
    minimums: { ...shown.minimums },
    inviteOnly: settings.inviteOnly,
    inviteOk,
  });
  if (settings.corporationName !== undefined && settings.corporationTicker !== undefined) {
    return info(await corpName(deps, corporationId, settings));
  }
  const now = deps.now();
  let found = recallTimed(corpCache, corporationId, now, CORP_CACHE_MS)?.value;
  if (found === undefined) {
    found = await deps.esi.corporation(corporationId);
    rememberTimed(corpCache, corporationId, found, now, CORP_CACHE_MAX);
  }
  if (!found) fail('not-found', 'No such corporation', 'unknown-corp');
  return info(found);
}

interface CharacterRead {
  input: VettingCharacterInput;
  character: StoredVettingCharacter;
  raw: PreparedRaw;
}

async function readVerified(
  deps: VettingDeps,
  claims: EveTokenClaims,
  accessToken: string
): Promise<CharacterRead> {
  const { input, raw } = await deps.esi.readCharacter(
    claims.characterId,
    accessToken,
    claims.scopes
  );
  const [corporation] = await deps.esi.names([input.corporationId]);
  const prepared = await prepareRaw(deps.esi, input.characterId, raw, {
    chunkBytes: deps.rawChunkBytes,
    logWarn: deps.logWarn,
  });
  return {
    input,
    raw: prepared,
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
      raw: prepared.meta,
    },
  };
}

const pilotOf = (character: StoredVettingCharacter): StoredVettingReview['pilot'] => ({
  characterId: character.characterId,
  name: character.name,
  corporationName: character.corporationName,
});

const inputDoc = (read: CharacterRead) => ({
  characterId: read.character.characterId,
  readAt: read.character.readAt,
  json: JSON.stringify(read.input),
});

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

function requireInvite(settings: StoredVettingSettings, code: string | undefined): void {
  if (!vettingInviteOk(settings, code)) {
    fail(
      'permission-denied',
      'This corporation takes applications by invite only',
      'invite-required'
    );
  }
}

export async function startVetting(
  deps: VettingDeps,
  input: VettingStartInput
): Promise<{ handle: VettingHandle; status: VettingStatus }> {
  const settings = await loadSettings(deps, input.corporationId);
  requireOn(settings);
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
  const made = await deps.db.runTransaction(async (tx) => {
    const current = readVettingSettings((await tx.get(settingsDoc)).data());
    requireOn(current);
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
  try {
    await writeRaw(ref, read.raw);
  } catch (err) {
    await tidyRawIds(
      ref,
      read.raw.chunks.map((piece) => piece.id),
      deps.logWarn
    );
    throw err;
  }
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

async function reserveRead(
  deps: VettingDeps,
  ref: DocumentReference,
  handle: VettingHandle,
  characterId: number
): Promise<void> {
  const dropped = await deps.db.runTransaction(async (tx) => {
    const now = deps.now();
    const loaded = pilotReview(await tx.get(ref), handle, now);
    requireEditable(loaded);
    const review = await dropExpiredInputs(tx, ref, loaded, now);
    if (review.reads >= VETTING_MAX_READS) {
      fail('resource-exhausted', 'This report has been read too many times', 'rate-limited');
    }
    requireRoom(review, characterId);
    tx.update(ref, { reads: review.reads + 1 });
    return review !== loaded;
  });
  if (dropped) await tidyRaw(ref, new Map(), deps.logWarn);
}

export async function addVettingCharacter(
  deps: VettingDeps,
  input: VettingHandle & { accessToken: string }
): Promise<VettingStatus> {
  const { ref, review: before } = await loadForPilot(deps, input);
  requireEditable(before);
  const claims = await verifyAccessToken(deps.verifyToken, input.accessToken);
  await reserveRead(deps, ref, input, claims.characterId);
  const read = await readVerified(deps, claims, input.accessToken);
  const settings = await loadSettings(deps, input.corporationId);
  let done: { status: VettingStatus; replacedRaw: StoredVettingCharacter['raw'] };
  try {
    await writeRaw(ref, read.raw);
    done = await addRead(deps, ref, input, read, settings);
  } catch (err) {
    await tidyRawIds(
      ref,
      read.raw.chunks.map((piece) => piece.id),
      deps.logWarn
    );
    throw err;
  }
  if (done.replacedRaw) {
    await tidyRawIds(
      ref,
      rawChunkIdsOf(read.character.characterId, done.replacedRaw),
      deps.logWarn
    );
  }
  return done.status;
}

async function addRead(
  deps: VettingDeps,
  ref: DocumentReference,
  input: VettingHandle,
  read: CharacterRead,
  settings: StoredVettingSettings
): Promise<{ status: VettingStatus; replacedRaw: StoredVettingCharacter['raw'] }> {
  return deps.db.runTransaction(async (tx) => {
    const now = deps.now();
    const review = pilotReview(await tx.get(ref), input, now);
    requireEditable(review);
    if (hasExpiredInputs(review, now)) changed();
    requireRoom(review, read.character.characterId);
    const others = review.characters.filter(
      (character) => character.characterId !== read.character.characterId
    );
    const isReplaced = others.length !== review.characters.length;
    const next: StoredVettingReview = {
      ...review,
      characters: isReplaced
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
      next.expiresAt = Math.min(requestExpiry(review.createdAt), draftExpiry(now));
    }
    tx.set(ref, next);
    tx.set(inputRef(ref, read.character.characterId), inputDoc(read));
    return {
      status: pilotStatus(input.reviewId, next, settings, now),
      replacedRaw: review.characters.find(
        (character) => character.characterId === read.character.characterId
      )?.raw,
    };
  });
}

export async function removeVettingCharacter(
  deps: VettingDeps,
  input: VettingHandle & { characterId: number }
): Promise<VettingStatus> {
  const ref = reviewRef(deps.db, input.corporationId, input.reviewId);
  const settings = await loadSettings(deps, input.corporationId);
  const done = await deps.db.runTransaction(async (tx) => {
    const now = deps.now();
    const loaded = pilotReview(await tx.get(ref), input, now);
    requireEditable(loaded);
    const review = await dropExpiredInputs(tx, ref, loaded, now);
    const next = withoutCharacter(review, input.characterId);
    tx.set(ref, next);
    if (review === loaded) tx.delete(inputRef(ref, input.characterId));
    return {
      status: pilotStatus(input.reviewId, next, settings, now),
      dropped: review !== loaded,
      raw: review.characters.find((character) => character.characterId === input.characterId)?.raw,
    };
  });
  if (done.dropped) await tidyRaw(ref, new Map(), deps.logWarn);
  else if (done.raw)
    await tidyRawIds(ref, rawChunkIdsOf(input.characterId, done.raw), deps.logWarn);
  return done.status;
}

function parseInput(json: unknown): VettingCharacterInput | undefined {
  if (typeof json !== 'string') return undefined;
  try {
    return JSON.parse(json) as VettingCharacterInput;
  } catch {
    return undefined;
  }
}

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

const readsVersion = (review: StoredVettingReview): string =>
  [
    review.reads,
    ...review.characters.map((character) => `${character.characterId}@${character.readAt}`),
  ].join(',');

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
  if (unmet.length > 0) fail('failed-precondition', unmet.join(','), 'below-minimum');
  return answers;
}

async function pushShared(
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

async function notifyShared(
  deps: VettingDeps,
  reviewId: string,
  review: StoredVettingReview
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<true>((resolve) => {
    timer = setTimeout(() => resolve(true), deps.notifyBudgetMs ?? VETTING_NOTIFY_BUDGET_MS);
  });
  const late = await Promise.race([pushShared(deps, reviewId, review), timedOut]);
  clearTimeout(timer);
  if (late) deps.logWarn?.('vettingShared push timed out', { reviewId });
}

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
    fail(
      'failed-precondition',
      `Add ${before.pilot.name} before sharing the report`,
      'pilot-missing'
    );
  }

  const settings = await loadSettings(deps, input.corporationId);
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
    const onReport = review.characters.filter((character) => byId.has(character.characterId));
    const rawCounts = sumRawCounts(onReport);
    const next: StoredVettingReview = {
      ...review,
      state: 'open',
      note: input.note,
      answers,
      characters: onReport,
      ...(rawCounts ? { rawCounts } : {}),
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
  await tidyRaw(ref, keptRaw(shared.characters), deps.logWarn);
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

export async function withdrawVetting(
  deps: VettingDeps,
  handle: VettingHandle
): Promise<Record<string, never>> {
  const ref = reviewRef(deps.db, handle.corporationId, handle.reviewId);
  pilotReview(await ref.get(), handle, null);
  await pruneRaw(ref);
  await deps.db.runTransaction(async (tx) => {
    pilotReview(await tx.get(ref), handle, null);
    const held = await tx.get(ref.collection(VETTING_INPUTS));
    for (const doc of held.docs) tx.delete(doc.ref);
    tx.delete(ref);
  });
  await tidyRaw(ref, new Map(), deps.logWarn);
  return {};
}

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
  await tidyRaw(ref, new Map(), deps.logWarn);
  return {};
}

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

interface Reviewer {
  actor: VettingActor;
  canConfigure: boolean;
}

async function authorizeReviewer(
  deps: VettingDeps,
  caller: Caller,
  call: BookCall,
  need: 'review' | 'configure'
): Promise<Reviewer> {
  const verified = await verifyCallerToken(deps, caller, call.accessToken);
  const { identity, roles } = await requireLiveRoles(deps, verified, {
    corporationId: call.corporationId,
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

async function recordReviewer(
  deps: VettingDeps,
  corporationId: number,
  actor: VettingActor
): Promise<void> {
  const ref = reviewersRef(deps.db, corporationId);
  try {
    if (!seenVettingReviewer((await ref.get()).data(), actor, deps.now())) return;
    await deps.db.runTransaction(async (tx) => {
      const next = seenVettingReviewer((await tx.get(ref)).data(), actor, deps.now());
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
    tx.set(ref, { invites: out.settings.invites }, { merge: true });
  });
  return overview(deps, call.corporationId, reviewer);
}

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

function officerReview(snap: { exists: boolean; data(): unknown }): StoredVettingReview {
  const review = snap.data() as StoredVettingReview | undefined;
  if (!snap.exists || !review || review.state === 'draft') {
    fail('not-found', 'No such review', 'not-found');
  }
  return review;
}

function refuseOwnReview(review: StoredVettingReview, actor: VettingActor): void {
  if (isSubject(review, actor)) {
    fail('permission-denied', 'This review is about you', 'own-review');
  }
}

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

export async function getVettingRawRows(
  deps: VettingDeps,
  caller: Caller,
  call: BookCall,
  input: VettingRawRowsInput
): Promise<VettingRawPage> {
  const { actor } = await authorizeReviewer(deps, caller, call, 'review');
  const ref = reviewRef(deps.db, call.corporationId, input.reviewId);
  const cursor = input.cursor === undefined ? null : decodeRawCursor(input.cursor);
  if (input.cursor !== undefined && cursor === null) {
    fail('invalid-argument', 'cursor is not valid', 'bad-cursor');
  }
  return deps.db.runTransaction(async (tx) => {
    const review = officerReview(await tx.get(ref));
    if (review.state === 'requested' || review.state === 'declined') {
      fail('not-found', 'No such review', 'not-found');
    }
    refuseOwnReview(review, actor);
    const position = rawPagePosition(review.characters, input.source, cursor);
    if (position === null) fail('invalid-argument', 'cursor is not valid', 'bad-cursor');
    const { order, start } = position;
    let at = start;
    let found: Pick<VettingRawPage, 'rows' | 'parties'> = { rows: [], parties: [] };
    for (; at < order.length; at += 1) {
      const entry = order[at];
      const snap = await tx.get(
        ref
          .collection(VETTING_RAW)
          .doc(rawChunkId(entry.characterId, entry.gen, input.source, entry.seq))
      );
      if (snap.exists) {
        found = pageOfChunk(snap.data());
        break;
      }
    }
    const following = order[at + 1];
    const now = deps.now();
    if (shouldLogOpen(review.log, actor.characterId, now)) {
      const log = appendVettingLog(review.log, {
        at: now,
        characterId: actor.characterId,
        name: actor.name,
        action: 'opened',
      });
      tx.update(ref, { log });
    }
    return {
      reviewId: input.reviewId,
      source: input.source,
      ...found,
      next: following ? encodeRawCursor(following.characterId, following.seq) : null,
    };
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
    const settings = await loadSettings(deps, call.corporationId, tx);
    const sign = {
      decision: input.decision,
      note: input.note,
      reasonShown: settings.rejection.showReason,
    };
    const out = decideSignOff(review, actor, sign, deps.now());
    if (!out.ok) {
      const [code, message] = REFUSAL[out.reason];
      return fail(code, message, out.reason);
    }
    tx.set(ref, out.review);
    return reviewView(input.reviewId, out.review, actor);
  });
}

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

const MAIL_REFUSAL = {
  'not-requested': ['failed-precondition', 'This review is not waiting for the member'],
  'not-asker': ['permission-denied', 'Only the officer who asked can record the mail'],
  'mail-cooldown': ['failed-precondition', 'The member was mailed less than a day ago'],
} as const;

export async function recordVettingRequestMail(
  deps: VettingDeps,
  caller: Caller,
  call: BookCall,
  input: { reviewId: string }
): Promise<VettingOverview> {
  const reviewer = await authorizeReviewer(deps, caller, call, 'review');
  const ref = reviewRef(deps.db, call.corporationId, input.reviewId);
  await deps.db.runTransaction(async (tx) => {
    const review = officerReview(await tx.get(ref));
    const out = recordRequestMail(review, reviewer.actor, deps.now());
    if (!out.ok) {
      const [code, message] = MAIL_REFUSAL[out.reason];
      return fail(code, message, out.reason);
    }
    tx.update(ref, { requestMail: out.review.requestMail });
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
