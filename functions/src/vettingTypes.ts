// Vetting: the layout and stored shapes the vetting callables, rules and sweep share.
// No Firestore, no ESI. The wire types and the checks are in vettingEngine.ts.
//
// Firestore layout (firestore.rules closes all of it to clients; every read and write is a
// `vettingCall` action through the Admin SDK):
//   corps/{corporationId}/vetting/settings                    the corp's VettingSettings
//   corps/{corporationId}/vettingReviews/{reviewId}           one review (StoredVettingReview)
//   corps/{corporationId}/vettingReviews/{reviewId}/inputs/{characterId}
//                                                             what one read of a character returned,
//                                                             held only until submit or withdraw
//   corps/{corporationId}/vettingThrottle/{characterId}       per-character daily draft counter
import type {
  VettingAssessment,
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
export const VETTING_ROLE_MAX = 40;
/** Dealings kept per character, newest first, so an input document stays under 1 MiB. */
export const VETTING_MAX_DEALINGS = 5000;
/** Names one settings save may add to the watchlist. */
export const VETTING_WATCH_ADD_MAX = 50;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** The settings document: the settings, plus the corp's name so the public page needs no ESI. */
export interface StoredVettingSettings extends VettingSettings {
  corporationName?: string;
  corporationTicker?: string;
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
}

/** A character read into a review, as the pilot's status lists it. */
export interface StoredVettingCharacter {
  characterId: number;
  name: string;
  corporationId: number;
  corporationName: string;
  missing: VettingSource[];
  readAt: number;
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
  note: string;
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
  deleteAt: number | null;
  /** When the daily sweep next acts on it (vettingDecide.ts `decideVettingSweep`); null while open. */
  expiresAt: number | null;
}
