// Vetting: the rules the store applies, without Firestore or ESI. Who may sign a review off and
// what a sign-off does to it, what each caller is shown (a pilot's status, an officer's blind
// view), how settings change, what the sweep does with a review, and the draft throttle.

import { isFiniteNumber, isPlainRecord } from './guards.js';
import {
  VETTING_DEFAULT_SETTINGS,
  VETTING_DRAFT_HOURS,
  VETTING_KEEP_DAYS,
  VETTING_WATCHLIST_MAX,
  type VettingAssessment,
  type VettingCharacterInput,
  type VettingKind,
  type VettingLogEntry,
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
  type StoredSignOff,
  type StoredVettingReview,
  type StoredVettingSettings,
  type VettingActor,
} from './vettingTypes.js';

// --- Settings ---------------------------------------------------------------

const WATCH_CATEGORIES = ['character', 'corporation', 'alliance'];

const clampSignOffs = (value: unknown, fallback: number): number =>
  isFiniteNumber(value) ? Math.min(3, Math.max(1, Math.round(value))) : fallback;

/** The settings document as stored, or the defaults (off) for a corp that has none. */
export function readVettingSettings(data: unknown): StoredVettingSettings {
  const d = isPlainRecord(data) ? data : {};
  const counts = isPlainRecord(d.signOffs) ? d.signOffs : {};
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
    on: d.on === true,
    watchlist,
    signOffs: {
      application: clampSignOffs(counts.application, VETTING_DEFAULT_SETTINGS.signOffs.application),
      promotion: clampSignOffs(counts.promotion, VETTING_DEFAULT_SETTINGS.signOffs.promotion),
    },
    ...(typeof d.corporationName === 'string' ? { corporationName: d.corporationName } : {}),
    ...(typeof d.corporationTicker === 'string' ? { corporationTicker: d.corporationTicker } : {}),
  };
}

/** What a caller is sent: the settings without the server's own fields. */
export function wireSettings(settings: StoredVettingSettings): VettingSettings {
  return { on: settings.on, watchlist: settings.watchlist, signOffs: settings.signOffs };
}

/** The first of `names` that ESI resolved to nothing, compared as ESI does (case-blind). */
export function unknownWatchName(
  names: readonly string[],
  resolved: readonly VettingWatchEntry[]
): string | undefined {
  const known = new Set(resolved.map((entry) => entry.name.toLowerCase()));
  return names.find((name) => !known.has(name.toLowerCase()));
}

/** `settings` with the patch applied; `watchlist-full` when the list would pass its cap. */
export function applyVettingSettingsPatch(
  settings: StoredVettingSettings,
  patch: VettingSettingsPatch,
  added: readonly VettingWatchEntry[]
): { ok: true; settings: StoredVettingSettings } | { ok: false; reason: 'watchlist-full' } {
  const removed = new Set(patch.removeWatch);
  const watchlist = settings.watchlist.filter((entry) => !removed.has(entry.id));
  for (const entry of added) {
    if (!watchlist.some((held) => held.id === entry.id)) watchlist.push(entry);
  }
  if (watchlist.length > VETTING_WATCHLIST_MAX) return { ok: false, reason: 'watchlist-full' };
  return {
    ok: true,
    settings: {
      ...settings,
      on: patch.on ?? settings.on,
      signOffs: patch.signOffs ?? settings.signOffs,
      watchlist,
    },
  };
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
 * Whether this reviewer is shut out of the decision: they asked for the review, or it is about
 * them (the pilot, or one of the characters read). The same person on another character of the
 * same EVE account counts as the requester.
 */
export function isBarred(review: StoredVettingReview, reviewer: VettingActor): boolean {
  const asked = review.requestedBy;
  if (
    asked &&
    (asked.ownerHash === reviewer.ownerHash || asked.characterId === reviewer.characterId)
  ) {
    return true;
  }
  return (
    review.pilot.characterId === reviewer.characterId ||
    review.characters.some((character) => character.characterId === reviewer.characterId)
  );
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
 * A reviewer's decision applied to an open review. A `no` rejects it at once; the review is
 * accepted when the `yes` count reaches `signOffsNeeded`. A decided review is kept
 * `VETTING_KEEP_DAYS` and then swept.
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
  const yes = signOffs.filter((signOff) => signOff.decision === 'yes').length;
  const state = decision === 'no' ? 'rejected' : yes >= review.signOffsNeeded ? 'accepted' : 'open';
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
    signed: review.signOffs.filter((signOff) => signOff.decision === 'yes').length,
    needed: review.signOffsNeeded,
    yours: review.state === 'open' && !isBarred(review, viewer) && !hasSigned(review, viewer),
    readAt: review.readAt,
    createdAt: review.createdAt,
    decidedAt: review.decidedAt,
  };
}

/**
 * The report as this officer may see it. Blind second review: another reviewer's decision and
 * note are left out until the viewer has recorded their own, or the review is decided.
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

/** What the pilot sees of their own review: no flags, no sign-offs, only who opened it. */
export function pilotStatus(id: string, review: StoredVettingReview): VettingStatus {
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

/**
 * What the daily sweep does with a review whose `expiresAt` has passed. A draft goes after
 * `VETTING_DRAFT_HOURS`; a requested or declined review 30 days after it was asked for; a
 * decided one at `deleteAt`. A requested review still holding what a member read into it loses
 * only that after `VETTING_DRAFT_HOURS`, so raw rows never outlive a draft.
 */
export function decideVettingSweep(
  review: Partial<StoredVettingReview>,
  now: number
): 'delete' | 'clear-inputs' | 'keep' {
  if (!isFiniteNumber(review.expiresAt) || review.expiresAt > now) return 'keep';
  if (review.state === 'open') return 'keep';
  if (review.state === 'requested') {
    if (isFiniteNumber(review.createdAt) && now < requestExpiry(review.createdAt)) {
      return (review.characters?.length ?? 0) > 0 ? 'clear-inputs' : 'keep';
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
