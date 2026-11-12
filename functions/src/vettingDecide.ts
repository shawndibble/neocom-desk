// Vetting: the rules the store applies, without Firestore or ESI. Who may sign a review off and
// what a sign-off does to it, what each caller is shown (a pilot's status, an officer's blind
// view), how settings change, what the sweep does with a review, and the draft throttle.

import { isFiniteNumber, isPlainRecord } from './guards.js';
import {
  VETTING_DRAFT_HOURS,
  VETTING_INVITES_MAX,
  VETTING_KEEP_DAYS,
  VETTING_OPEN_KEEP_DAYS,
  VETTING_WATCHLIST_MAX,
  normalizeVettingSettings,
  unmetVettingMinimums,
  type VettingAssessment,
  type VettingCharacterInput,
  type VettingInvite,
  type VettingKind,
  type VettingLogEntry,
  type VettingQuestion,
  type VettingReportCharacter,
  type VettingReview,
  type VettingReviewSummary,
  type VettingSettings,
  type VettingSeverity,
  type VettingSignOffView,
  type VettingStatus,
  type VettingWatchEntry,
} from './vettingEngine.js';
import type { VettingSettingsPatch } from './vettingParse.js';
import {
  DAY_MS,
  HOUR_MS,
  VETTING_DAILY_DRAFTS,
  VETTING_LOG_MAX,
  VETTING_REQUEST_KEEP_DAYS,
  VETTING_REVIEWER_DAYS,
  type StoredSignOff,
  type StoredVettingReview,
  type StoredVettingReviewers,
  type StoredVettingSettings,
  type VettingActor,
} from './vettingTypes.js';

// --- Settings ---------------------------------------------------------------

const WATCH_CATEGORIES = ['character', 'corporation', 'alliance'];

function readInvites(raw: unknown): VettingInvite[] {
  return (Array.isArray(raw) ? (raw as unknown[]) : []).flatMap((entry): VettingInvite[] => {
    if (!isPlainRecord(entry) || !isPlainRecord(entry.createdBy)) return [];
    const { code, label, createdBy, createdAt, uses } = entry;
    if (typeof code !== 'string' || !code || typeof label !== 'string') return [];
    if (!isFiniteNumber(createdBy.characterId) || typeof createdBy.name !== 'string') return [];
    if (!isFiniteNumber(createdAt) || !isFiniteNumber(uses)) return [];
    return [
      {
        code,
        label,
        createdBy: { characterId: createdBy.characterId, name: createdBy.name },
        createdAt,
        uses,
      },
    ];
  });
}

/**
 * The settings document as stored, or the defaults (off) for a corp that has none. Every read
 * goes through `normalizeVettingSettings`, so a document written before a setting existed reads
 * as that setting's default. The watchlist and the invites are the server's own, checked here.
 */
export function readVettingSettings(data: unknown): StoredVettingSettings {
  const d = isPlainRecord(data) ? data : {};
  const watchlist = (Array.isArray(d.watchlist) ? (d.watchlist as unknown[]) : []).flatMap(
    (entry): VettingWatchEntry[] =>
      isPlainRecord(entry) &&
      isFiniteNumber(entry.id) &&
      typeof entry.name === 'string' &&
      WATCH_CATEGORIES.includes(entry.category as string)
        ? [
            {
              id: entry.id,
              name: entry.name,
              category: entry.category as VettingWatchEntry['category'],
            },
          ]
        : []
  );
  return {
    ...normalizeVettingSettings(d),
    watchlist,
    invites: readInvites(d.invites),
    ...(typeof d.corporationName === 'string' ? { corporationName: d.corporationName } : {}),
    ...(typeof d.corporationTicker === 'string' ? { corporationTicker: d.corporationTicker } : {}),
  };
}

/** What a caller is sent: the settings without the server's own fields. */
export function wireSettings(settings: StoredVettingSettings): VettingSettings {
  // The normalizer returns the wire settings and nothing else: no invites, no corp name.
  return { ...normalizeVettingSettings(settings), watchlist: settings.watchlist };
}

/** The first of `names` that ESI resolved to nothing, compared as ESI does (case-blind). */
export function unknownWatchName(
  names: readonly string[],
  resolved: readonly VettingWatchEntry[]
): string | undefined {
  const known = new Set(resolved.map((entry) => entry.name.toLowerCase()));
  return names.find((name) => !known.has(name.toLowerCase()));
}

/**
 * The questions a patch leaves: its whole list, in its order. A question keeps its id only when
 * the corp already had one by that id (once per list); any other entry is new and gets one.
 */
function patchedQuestions(
  held: readonly VettingQuestion[],
  sent: NonNullable<VettingSettingsPatch['questions']>,
  newId: () => string
): VettingQuestion[] {
  const known = new Set(held.map((question) => question.id));
  const used = new Set<string>();
  return sent.map((entry) => {
    let id = entry.id !== undefined && known.has(entry.id) && !used.has(entry.id) ? entry.id : '';
    while (!id || used.has(id)) id = newId();
    used.add(id);
    return { id, label: entry.label, required: entry.required };
  });
}

/**
 * `settings` with the patch applied, its numbers clamped by `normalizeVettingSettings`;
 * `watchlist-full` when the list would pass its cap. The invites are not a patch's to change.
 */
export function applyVettingSettingsPatch(
  settings: StoredVettingSettings,
  patch: VettingSettingsPatch,
  added: readonly VettingWatchEntry[],
  newId: () => string
): { ok: true; settings: StoredVettingSettings } | { ok: false; reason: 'watchlist-full' } {
  const removed = new Set(patch.removeWatch);
  const watchlist = settings.watchlist.filter((entry) => !removed.has(entry.id));
  for (const entry of added) {
    if (!watchlist.some((held) => held.id === entry.id)) watchlist.push(entry);
  }
  if (watchlist.length > VETTING_WATCHLIST_MAX) return { ok: false, reason: 'watchlist-full' };
  const next = normalizeVettingSettings({
    on: patch.on ?? settings.on,
    signOffs: patch.signOffs ?? settings.signOffs,
    welcome: patch.welcome ?? settings.welcome,
    contact: patch.contact ?? settings.contact,
    questions: patch.questions
      ? patchedQuestions(settings.questions, patch.questions, newId)
      : settings.questions,
    minimums: patch.minimums ?? settings.minimums,
    rejection: patch.rejection ?? settings.rejection,
    inviteOnly: patch.inviteOnly ?? settings.inviteOnly,
    notifyReviewers: patch.notifyReviewers ?? settings.notifyReviewers,
    mailDecision: patch.mailDecision ?? settings.mailDecision,
  });
  return { ok: true, settings: { ...settings, ...next, watchlist } };
}

// --- Invites ----------------------------------------------------------------

/** The invite `code` names, while it has not been revoked. */
export function liveVettingInvite(
  settings: StoredVettingSettings,
  code: string | undefined
): VettingInvite | undefined {
  return code === undefined ? undefined : settings.invites.find((held) => held.code === code);
}

/** Whether an apply link carrying `code` may start an application. */
export function vettingInviteOk(
  settings: StoredVettingSettings,
  code: string | undefined
): boolean {
  return !settings.inviteOnly || liveVettingInvite(settings, code) !== undefined;
}

export function addVettingInvite(
  settings: StoredVettingSettings,
  invite: VettingInvite
): { ok: true; settings: StoredVettingSettings } | { ok: false; reason: 'invites-full' } {
  if (settings.invites.length >= VETTING_INVITES_MAX) return { ok: false, reason: 'invites-full' };
  return { ok: true, settings: { ...settings, invites: [...settings.invites, invite] } };
}

/** Revoked: the code stops working; applications started with it keep the label they recorded. */
export function withoutVettingInvite(
  settings: StoredVettingSettings,
  code: string
): StoredVettingSettings {
  return { ...settings, invites: settings.invites.filter((held) => held.code !== code) };
}

/** `settings` with one more application counted against the invite `code`. */
export function withVettingInviteUsed(
  settings: StoredVettingSettings,
  code: string
): StoredVettingSettings {
  return {
    ...settings,
    invites: settings.invites.map((held) =>
      held.code === code ? { ...held, uses: held.uses + 1 } : held
    ),
  };
}

// --- Known reviewers --------------------------------------------------------

function readReviewers(data: unknown): StoredVettingReviewers['reviewers'] {
  const raw = isPlainRecord(data) && isPlainRecord(data.reviewers) ? data.reviewers : {};
  const out: StoredVettingReviewers['reviewers'] = {};
  for (const [uid, entry] of Object.entries(raw)) {
    if (
      isPlainRecord(entry) &&
      isFiniteNumber(entry.characterId) &&
      isFiniteNumber(entry.lastSeenAt)
    ) {
      out[uid] = { characterId: entry.characterId, lastSeenAt: entry.lastSeenAt };
    }
  }
  return out;
}

const reviewerSeenRecently = (lastSeenAt: number, now: number): boolean =>
  now - lastSeenAt < VETTING_REVIEWER_DAYS * DAY_MS;

/**
 * The reviewers document after `uid` was seen holding a reviewer role now, without anyone not
 * seen in `VETTING_REVIEWER_DAYS`; null when it need not be written (seen within the day).
 */
export function seenVettingReviewer(
  data: unknown,
  uid: string,
  characterId: number,
  now: number
): StoredVettingReviewers | null {
  const held = readReviewers(data);
  const mine = held[uid];
  if (mine && mine.characterId === characterId && now >= mine.lastSeenAt) {
    if (now - mine.lastSeenAt < DAY_MS) return null;
  }
  const reviewers: StoredVettingReviewers['reviewers'] = {};
  for (const [id, entry] of Object.entries(held)) {
    if (reviewerSeenRecently(entry.lastSeenAt, now)) reviewers[id] = entry;
  }
  reviewers[uid] = { characterId, lastSeenAt: now };
  return { reviewers };
}

/**
 * The Characters to tell that a report was shared: reviewers seen in the last
 * `VETTING_REVIEWER_DAYS`, never one the report is about.
 */
export function vettingSharedRecipients(
  data: unknown,
  review: StoredVettingReview,
  now: number
): number[] {
  const ids = new Set<number>();
  for (const entry of Object.values(readReviewers(data))) {
    if (!reviewerSeenRecently(entry.lastSeenAt, now)) continue;
    if (isSubject(review, { characterId: entry.characterId, ownerHash: '' })) continue;
    ids.add(entry.characterId);
  }
  return [...ids].sort((a, b) => a - b);
}

// --- Log --------------------------------------------------------------------

/** The log with one more entry, keeping the newest `VETTING_LOG_MAX`. */
export function appendVettingLog(
  log: readonly VettingLogEntry[],
  entry: VettingLogEntry
): VettingLogEntry[] {
  return [...log, entry].slice(-VETTING_LOG_MAX);
}

/** Opening a report is logged once per reviewer per hour, so a reload does not flood the log. */
export function shouldLogOpen(
  log: readonly VettingLogEntry[],
  characterId: number,
  now: number
): boolean {
  return !log.some(
    (entry) =>
      entry.action === 'opened' && entry.characterId === characterId && now - entry.at < HOUR_MS
  );
}

// --- Sign-offs --------------------------------------------------------------

const DECIDED = ['accepted', 'rejected'];

/**
 * Whether the review is about this person: its pilot, a character read into it or on its
 * report, or another character of the EVE account one of those was read from. The subject may
 * neither read the report nor sign it off (`own-review`).
 */
export function isSubject(
  review: StoredVettingReview,
  person: Pick<VettingActor, 'characterId' | 'ownerHash'>
): boolean {
  return (
    review.pilot.characterId === person.characterId ||
    review.reportCharacters.some((character) => character.characterId === person.characterId) ||
    review.characters.some(
      (character) =>
        character.characterId === person.characterId ||
        (character.ownerHash !== undefined && character.ownerHash === person.ownerHash)
    )
  );
}

/**
 * Whether this reviewer is shut out of the decision: they asked for the review, or it is about
 * them (`isSubject`). The same person on another character of the same EVE account counts as
 * the requester.
 */
export function isBarred(review: StoredVettingReview, reviewer: VettingActor): boolean {
  const asked = review.requestedBy;
  if (
    asked &&
    (asked.ownerHash === reviewer.ownerHash || asked.characterId === reviewer.characterId)
  ) {
    return true;
  }
  return isSubject(review, reviewer);
}

/** One sign-off per person: a second character of the same account has already signed. */
function hasSigned(review: StoredVettingReview, reviewer: VettingActor): boolean {
  return review.signOffs.some(
    (signOff) =>
      signOff.ownerHash === reviewer.ownerHash || signOff.characterId === reviewer.characterId
  );
}

export type SignOffRefusal = 'not-open' | 'barred' | 'already-signed';

/**
 * A reviewer's sign-off recorded on an open review. Nothing is decided until `signOffsNeeded`
 * people have signed, whichever way: then the review is rejected if any of them said `no`, and
 * accepted otherwise. A `no` therefore closes nothing early, so that a review still open says
 * nothing about the sign-offs already on it (the blind second review). A decided review is kept
 * `VETTING_KEEP_DAYS` and then swept; an undecided one keeps the expiry its submit gave it.
 */
export function decideSignOff(
  review: StoredVettingReview,
  reviewer: VettingActor,
  decision: 'yes' | 'no',
  note: string,
  now: number
): { ok: true; review: StoredVettingReview } | { ok: false; reason: SignOffRefusal } {
  if (review.state !== 'open') return { ok: false, reason: 'not-open' };
  if (isBarred(review, reviewer)) return { ok: false, reason: 'barred' };
  if (hasSigned(review, reviewer)) return { ok: false, reason: 'already-signed' };

  const signOffs: StoredSignOff[] = [...review.signOffs, { ...reviewer, at: now, decision, note }];
  const state =
    signOffs.length < review.signOffsNeeded
      ? 'open'
      : signOffs.some((signOff) => signOff.decision === 'no')
        ? 'rejected'
        : 'accepted';
  const next: StoredVettingReview = {
    ...review,
    signOffs,
    state,
    log: appendVettingLog(review.log, {
      at: now,
      characterId: reviewer.characterId,
      name: reviewer.name,
      action: 'decided',
    }),
  };
  if (state !== 'open') {
    next.decidedAt = now;
    next.deleteAt = now + VETTING_KEEP_DAYS * DAY_MS;
    next.expiresAt = next.deleteAt;
  }
  return { ok: true, review: next };
}

// --- Views ------------------------------------------------------------------

function worstOf(assessment: VettingAssessment | null): VettingSeverity | undefined {
  if (!assessment || assessment.flags.length === 0) return undefined;
  return assessment.flags.some((flag) => flag.severity === 'critical') ? 'critical' : 'warning';
}

/** A queue row. `viewer` is the officer looking, for `yours`. */
export function reviewSummary(
  id: string,
  review: StoredVettingReview,
  viewer: VettingActor
): VettingReviewSummary {
  const worst = worstOf(review.assessment);
  return {
    id,
    kind: review.kind,
    ...(review.role ? { role: review.role } : {}),
    state: review.state,
    pilot: {
      characterId: review.pilot.characterId,
      name: review.pilot.name,
      corporationName: review.pilot.corporationName,
    },
    characters: review.characters.length,
    flags: review.assessment?.flags.length ?? 0,
    ...(worst ? { worst } : {}),
    missing: review.assessment?.checks.filter((check) => check.state === 'missing').length ?? 0,
    // Every sign-off, not the yes count: that would give an open review's decisions away.
    signed: review.signOffs.length,
    needed: review.signOffsNeeded,
    yours: review.state === 'open' && !isBarred(review, viewer) && !hasSigned(review, viewer),
    readAt: review.readAt,
    createdAt: review.createdAt,
    decidedAt: review.decidedAt,
    // The label only: the code is the corp's to hand out, not a row's to show.
    ...(review.invite ? { invite: review.invite.label } : {}),
  };
}

/**
 * The report as this officer may see it. Blind second review: another reviewer's decision and
 * note are left out (their name and the time stay) until the viewer has recorded their own, or
 * the review is decided. An open review's state gives nothing away either: see `decideSignOff`.
 */
export function reviewView(
  id: string,
  review: StoredVettingReview,
  viewer: VettingActor
): VettingReview {
  const revealed = DECIDED.includes(review.state) || hasSigned(review, viewer);
  const signOffs = review.signOffs.map((signOff): VettingSignOffView => {
    const you =
      signOff.ownerHash === viewer.ownerHash || signOff.characterId === viewer.characterId;
    return {
      characterId: signOff.characterId,
      name: signOff.name,
      you,
      at: signOff.at,
      ...(revealed || you ? { decision: signOff.decision, note: signOff.note } : {}),
    };
  });
  return {
    ...reviewSummary(id, review, viewer),
    corporationId: review.corporationId,
    note: review.note,
    answers: review.answers ?? [],
    ...(review.requestedBy
      ? {
          requestedBy: {
            characterId: review.requestedBy.characterId,
            name: review.requestedBy.name,
          },
        }
      : {}),
    barred: isBarred(review, viewer),
    reportCharacters: review.reportCharacters,
    parties: review.parties,
    assessment: review.assessment,
    signOffs,
    log: review.log,
    deleteAt: review.deleteAt,
  };
}

const SHARED = ['open', ...DECIDED];

/**
 * What the pilot sees of their own review: no flags, no sign-offs, only who opened it. What the
 * corp asks is read from its settings as they are now: the questions and unmet minimums of an
 * application (a promotion is asked neither), the contact once the report is shared, and for a
 * rejected review the corp's wording, with the notes of the reviewers who said no only when the
 * corp shows them.
 */
export function pilotStatus(
  id: string,
  review: StoredVettingReview,
  settings: VettingSettings,
  now: number
): VettingStatus {
  const application = review.kind === 'application';
  return {
    id,
    corporationId: review.corporationId,
    corporationName: review.corporationName,
    corporationTicker: review.corporationTicker,
    kind: review.kind,
    ...(review.role ? { role: review.role } : {}),
    state: review.state,
    ...(review.requestedBy
      ? {
          requestedBy: {
            characterId: review.requestedBy.characterId,
            name: review.requestedBy.name,
          },
        }
      : {}),
    characters: review.characters.map((character) => ({
      characterId: character.characterId,
      name: character.name,
      corporationName: character.corporationName,
      missing: character.missing,
    })),
    note: review.note,
    readAt: review.readAt,
    decidedAt: review.decidedAt,
    deleteAt: review.deleteAt,
    openedBy: review.log
      .filter((entry) => entry.action === 'opened')
      .map((entry) => ({ name: entry.name, at: entry.at }))
      .sort((a, b) => b.at - a.at),
    contact: SHARED.includes(review.state) ? settings.contact : '',
    questions: application ? settings.questions : [],
    answers: review.answers ?? [],
    unmet:
      application && review.state === 'draft'
        ? unmetVettingMinimums(
            settings.minimums,
            review.characters.map((character) => ({
              birthday: character.birthday ?? '',
              skillPoints: character.skillPoints ?? null,
            })),
            now
          )
        : [],
    ...(review.state === 'rejected'
      ? {
          rejection: {
            wording: settings.rejection.wording,
            reasons: settings.rejection.showReason
              ? review.signOffs
                  .filter((signOff) => signOff.decision === 'no' && signOff.note.trim() !== '')
                  .map((signOff) => signOff.note.trim())
              : [],
          },
        }
      : {}),
  };
}

// --- The report -------------------------------------------------------------

/** A declared character as the report keeps it: summary facts, never its dealings. */
export function reportCharacter(
  input: VettingCharacterInput,
  corporationName: string
): VettingReportCharacter {
  return {
    characterId: input.characterId,
    name: input.name,
    corporationId: input.corporationId,
    corporationName,
    birthday: input.birthday,
    skillPoints: input.skillPoints,
    corporations: new Set(input.history.map((stay) => stay.corporationId)).size,
    missing: input.missing,
  };
}

/** The ids a report's flags name: evidence rows, and the `partyId`/`corporationId` facts. */
export function referencedPartyIds(assessment: VettingAssessment): number[] {
  const ids = new Set<number>();
  for (const flag of assessment.flags) {
    for (const row of flag.evidence) ids.add(row.partyId);
    for (const key of ['partyId', 'corporationId']) {
      const id = flag.facts[key];
      if (isFiniteNumber(id) && id > 0) ids.add(id);
    }
  }
  return [...ids];
}

// --- Drafts and the sweep ---------------------------------------------------

/** A review with one character taken out; an application's pilot moves to the next one left. */
export function withoutCharacter(
  review: StoredVettingReview,
  characterId: number
): StoredVettingReview {
  const characters = review.characters.filter((c) => c.characterId !== characterId);
  const next: StoredVettingReview = { ...review, characters };
  const first = characters[0];
  if (review.kind === 'application' && review.pilot.characterId === characterId && first) {
    next.pilot = {
      characterId: first.characterId,
      name: first.name,
      corporationName: first.corporationName,
    };
  }
  if (review.state === 'requested' && characters.length === 0) {
    next.expiresAt = requestExpiry(review.createdAt);
  }
  return next;
}

export const draftExpiry = (now: number): number => now + VETTING_DRAFT_HOURS * HOUR_MS;
export const requestExpiry = (createdAt: number): number =>
  createdAt + VETTING_REQUEST_KEEP_DAYS * DAY_MS;
/** When a shared review nobody decides is deleted, counted from its submit. */
export const openExpiry = (now: number): number => now + VETTING_OPEN_KEEP_DAYS * DAY_MS;

const expired = (review: Partial<StoredVettingReview>, now: number): boolean =>
  isFiniteNumber(review.expiresAt) && review.expiresAt <= now;

/**
 * A draft past its `VETTING_DRAFT_HOURS`. The sweep runs once a day, so until it does the
 * store treats such a draft as gone: what was read into it is never used again.
 */
export function isExpiredDraft(review: Partial<StoredVettingReview>, now: number): boolean {
  return review.state === 'draft' && expired(review, now);
}

/**
 * A request still holding what a member read into it more than `VETTING_DRAFT_HOURS` ago. The
 * request itself lives on; the store drops the reads (`withoutInputs`) before using it.
 */
export function hasExpiredInputs(review: Partial<StoredVettingReview>, now: number): boolean {
  return (
    review.state === 'requested' && (review.characters?.length ?? 0) > 0 && expired(review, now)
  );
}

/** A request with what was read into it dropped: the sweep's `clear-inputs`. */
export function withoutInputs(review: StoredVettingReview): StoredVettingReview {
  return { ...review, characters: [], expiresAt: requestExpiry(review.createdAt) };
}

/**
 * What the daily sweep does with a review whose `expiresAt` has passed. A draft goes after
 * `VETTING_DRAFT_HOURS`; a requested or declined review 30 days after it was asked for; a
 * shared one nobody decided `VETTING_OPEN_KEEP_DAYS` after its submit; a decided one at
 * `deleteAt`. A requested review still holding what a member read into it loses only that
 * after `VETTING_DRAFT_HOURS`, so raw rows never outlive a draft.
 */
export function decideVettingSweep(
  review: Partial<StoredVettingReview>,
  now: number
): 'delete' | 'clear-inputs' | 'keep' {
  if (!expired(review, now)) return 'keep';
  if (review.state === 'requested') {
    if (isFiniteNumber(review.createdAt) && now < requestExpiry(review.createdAt)) {
      return hasExpiredInputs(review, now) ? 'clear-inputs' : 'keep';
    }
  }
  return 'delete';
}

export interface DraftThrottle {
  windowStart: number;
  count: number;
}

/** Fixed one-day window; a refused start is not counted, so hammering never extends the lockout. */
export function nextDraftSlot(
  state: DraftThrottle | undefined,
  now: number
): { allowed: boolean; state: DraftThrottle } {
  if (!state || !isFiniteNumber(state.windowStart) || now - state.windowStart >= DAY_MS) {
    return { allowed: true, state: { windowStart: now, count: 1 } };
  }
  if (state.count >= VETTING_DAILY_DRAFTS) return { allowed: false, state };
  return { allowed: true, state: { windowStart: state.windowStart, count: state.count + 1 } };
}

/** The sign-offs a review of this kind needs under these settings. */
export function signOffsNeeded(settings: VettingSettings, kind: VettingKind): number {
  return settings.signOffs[kind];
}

// --- The public corp lookup --------------------------------------------------

export interface TimedEntry<T> {
  at: number;
  value: T;
}

/** What `rememberTimed` kept under `key`, while it is younger than `ttlMs`. */
export function recallTimed<K, T>(
  cache: Map<K, TimedEntry<T>>,
  key: K,
  now: number,
  ttlMs: number
): TimedEntry<T> | undefined {
  const held = cache.get(key);
  return held && now >= held.at && now - held.at < ttlMs ? held : undefined;
}

/** Keeps `value` under `key`, dropping the oldest entries so the map holds at most `max`. */
export function rememberTimed<K, T>(
  cache: Map<K, TimedEntry<T>>,
  key: K,
  value: T,
  now: number,
  max: number
): void {
  cache.delete(key);
  for (const oldest of cache.keys()) {
    if (cache.size < max) break;
    cache.delete(oldest);
  }
  cache.set(key, { at: now, value });
}
