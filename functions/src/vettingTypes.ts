// Vetting: the layout and stored shapes the vetting callables, rules and sweep share.
// No Firestore, no ESI. The wire types and the checks are in vettingEngine.ts.
//
// Firestore layout (firestore.rules closes all of it to clients; every read and write is a
// `vettingCall` action through the Admin SDK):
//   corps/{corporationId}/vetting/settings                    the corp's VettingSettings, with its
//                                                             watchlist and invites
//   corps/{corporationId}/vetting/reviewers                   who was last seen holding a reviewer
//                                                             role, and on which EVE account
//                                                             (StoredVettingReviewers)
//   corps/{corporationId}/vettingReviews/{reviewId}           one review (StoredVettingReview)
//   corps/{corporationId}/vettingReviews/{reviewId}/inputs/{characterId}
//                                                             what one read of a character returned,
//                                                             held only until submit or withdraw
//   corps/{corporationId}/vettingThrottle/{characterId}       per-character daily draft counter
import type {
  VettingAnswer,
  VettingAssessment,
  VettingInvite,
  VettingKind,
  VettingLogEntry,
  VettingParty,
  VettingReportCharacter,
  VettingSettings,
  VettingSource,
  VettingState,
} from './vettingEngine.js';

export const VETTING_SETTINGS_COLLECTION = 'vetting';
export const VETTING_SETTINGS_DOC = 'settings';
/** Beside the settings, in the same closed collection. */
export const VETTING_REVIEWERS_DOC = 'reviewers';
export const VETTING_REVIEWS = 'vettingReviews';
export const VETTING_INPUTS = 'inputs';
export const VETTING_THROTTLE = 'vettingThrottle';

/**
 * Every vetting subcollection directly under `corps/{id}`. The Corp Tax Book shares that
 * document, and deleting the book deletes every subcollection it is not told to keep
 * (corpTaxBookStore.ts `deleteBookContents`); a new one goes here, or the book's delete wipes it
 * (vettingTypes.test.ts guards this).
 */
export const VETTING_COLLECTIONS: readonly string[] = [
  VETTING_SETTINGS_COLLECTION,
  VETTING_REVIEWS,
  VETTING_THROTTLE,
];

/** A `requested` or `declined` review is deleted this long after it was asked for. */
export const VETTING_REQUEST_KEEP_DAYS = 30;
export const VETTING_LOG_MAX = 100;
/** Character reads one review may make, counting re-reads. */
export const VETTING_MAX_READS = 30;
/** Drafts one verified character may start per corporation per day. */
export const VETTING_DAILY_DRAFTS = 10;
/** Dealings kept per character, newest first, so an input document stays under 1 MiB. */
export const VETTING_MAX_DEALINGS = 5000;
/** Names one settings save may add to the watchlist. */
export const VETTING_WATCH_ADD_MAX = 50;

/** A reviewer not seen holding the role for this long is no longer told of a shared report. */
export const VETTING_REVIEWER_DAYS = 30;
/** The most reviewers one shared report is pushed to, the most recently seen first. */
export const VETTING_NOTIFY_MAX = 50;
/** How long a submit waits for that push before it answers the pilot without it. */
export const VETTING_NOTIFY_BUDGET_MS = 3000;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** The settings document: the settings, plus the corp's name so the public page needs no ESI. */
export interface StoredVettingSettings extends VettingSettings {
  /** Server-owned, like the watchlist: changed only by the invite actions and a start. */
  invites: VettingInvite[];
  corporationName?: string;
  corporationTicker?: string;
}

/**
 * Who the overview last saw holding a reviewer role, by Firebase uid. There is no role list to
 * read without a token, so this is how a shared report finds the reviewers to tell
 * (`vettingShared`). Written when an overview succeeds; entries older than
 * `VETTING_REVIEWER_DAYS` are dropped on the next write and never used.
 */
export interface StoredVettingReviewers {
  reviewers: Record<string, StoredVettingReviewer>;
}

interface StoredVettingReviewer {
  characterId: number;
  /**
   * The reviewer's EVE account, so a report is never pushed to another character of its own
   * pilot. Absent on an entry stored before it was kept, which is matched by character only.
   */
  ownerHash?: string;
  lastSeenAt: number;
}

/** A person, as the server knows them: the Character and the EVE account behind it. */
export interface VettingActor {
  characterId: number;
  name: string;
  uid: string;
  ownerHash: string;
}

export interface StoredSignOff extends VettingActor {
  at: number;
  decision: 'yes' | 'no';
  note: string;
  /**
   * The corp's `rejection.showReason` when this was signed: only then may a no's note reach the
   * pilot, whatever the setting becomes later. Absent on a sign-off stored before it was kept,
   * which reads as false.
   */
  reasonShown?: boolean;
}

/** A character read into a review, as the pilot's status lists it. */
export interface StoredVettingCharacter {
  characterId: number;
  name: string;
  corporationId: number;
  corporationName: string;
  missing: VettingSource[];
  readAt: number;
  /**
   * Kept so a draft's status can say which minimums are not met yet. Absent on a character read
   * before they were kept, which then meets neither minimum until it is read again.
   */
  birthday?: string;
  skillPoints?: number | null;
  /**
   * The EVE account the read's token belonged to, so another character of the same account
   * cannot open the report as a reviewer. Absent on a review stored before it was kept.
   */
  ownerHash?: string;
}

export interface StoredVettingReview {
  corporationId: number;
  corporationName: string;
  corporationTicker: string;
  state: VettingState;
  kind: VettingKind;
  role?: string;
  pilot: { characterId: number; name: string; corporationName: string };
  requestedBy?: VettingActor;
  /** SHA-256 of the pilot's secret, hex; null until a requested member is handed one. */
  keyHash: string | null;
  /** The invite an application started from. Officers are shown the label, nobody the code. */
  invite?: { code: string; label: string };
  note: string;
  /** What an application answered, settled at submit. Absent on a review stored before it. */
  answers?: VettingAnswer[];
  characters: StoredVettingCharacter[];
  /** Character reads made so far; also the version a submit checks nothing changed under it. */
  reads: number;
  reportCharacters: VettingReportCharacter[];
  parties: VettingParty[];
  assessment: VettingAssessment | null;
  signOffs: StoredSignOff[];
  log: VettingLogEntry[];
  signOffsNeeded: number;
  createdAt: number;
  readAt: number | null;
  decidedAt: number | null;
  /**
   * When the pilot is told the review goes: `expiresAt` once shared (90 days undecided, 30 days
   * after a decision); null before that.
   */
  deleteAt: number | null;
  /**
   * When the daily sweep next acts on it (vettingDecide.ts `decideVettingSweep`), and when a
   * draft, or what a member read into a request, stops being usable.
   */
  expiresAt: number | null;
}
