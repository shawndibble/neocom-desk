// The Corp Tax Book's version marker (issue #5047), declared once for both sides.
//
// Every server write under `corps/{id}/...` restamps, on `corps/{id}`, a version
// for the subcollection it touched (`collectionVersions.<name>`) and the book as a
// whole (`bookVersion`) — see corpTaxBookVersionTracking.ts. A client holding a
// copy of a subcollection re-reads it only when that stamp moved
// (src/features/corp/taxBook/bookCache.ts).
//
// Dependency-free on purpose: the client bundle imports this file.

/** Field on `corps/{id}`: a fresh random id on every server write to the book. */
export const BOOK_VERSION_FIELD = 'bookVersion';
/** Field on `corps/{id}`: subcollection name → a fresh random id on every write to it. */
export const COLLECTION_VERSIONS_FIELD = 'collectionVersions';

// --- The book's subcollections under `corps/{id}`, named once for the server and the client ---

export const OBSERVED = 'observed';
export const EXTRACTIONS = 'extractions';
/** `payments/{id}`: read by its sender (`uid`) and its Miner's readers (`uids`). */
export const PAYMENTS = 'payments';
export const DISMISSALS = 'dismissals';
export const DECLARATIONS = 'declarations';
/** `disputes/{minerId_date}`: a Miner says a Conflict day's ore went to another Payee (#6206). */
export const DISPUTES = 'disputes';
export const ADJUSTMENTS = 'adjustments';
export const WRITE_OFFS = 'writeOffs';
/** `toleranceExemptions/{id}`: an officer's limit on what one Miner-day shortfall may forgive. */
export const TOLERANCE_EXEMPTIONS = 'toleranceExemptions';
/**
 * `minerPaid/{minerId}`: a copy of the Miner's paid-through day from `meta/paid` (officer-only),
 * readable by that Miner so their own Tax tab can close the same days the book does.
 */
export const MINER_PAID = 'minerPaid';
export const REBILLS = 'rebills';
/** `corpTaxBookTokens/{token}`: a verify link's token, naming its corporation and notice. */
export const TOKENS_COLLECTION = 'corpTaxBookTokens';
/** The legacy mirror of every Late notice, for older tabs until the soak ends. */
export const STATEMENTS = 'statements';
/** `statementLinks/{statementId}`: the verify token, readable by editors only. */
export const STATEMENT_LINKS = 'statementLinks';
/**
 * `lateNotices/{noticeId}`: a `LateNotice` and a server `updatedAt` (decision 20261120-235011).
 * Officers read every one; a Miner reads their own (`uids`).
 */
export const LATE_NOTICES = 'lateNotices';
/** `lateNoticeLinks/{noticeId}`: `{ token }`, the verify link's token. Editors only. */
export const LATE_NOTICE_LINKS = 'lateNoticeLinks';
/**
 * `accountCheckpoints/{minerId}`: a `RunningAccountCheckpoint`, its Miner's readers (`uids`) and a
 * server `updatedAt`. Officers read every one; a Miner reads their own.
 */
export const RUNNING_ACCOUNT_CHECKPOINTS = 'accountCheckpoints';
export const MINERS = 'miners';
export const META = 'meta';
/** `readersQueue/pending`: the copies of readers (`uids`) still to rewrite. Function-only. */
export const READERS_QUEUE = 'readersQueue';

/**
 * Subcollections whose writes never change what a client caches, so they move
 * no stamp: officer access records (rewritten on every officer check, which
 * the officer page makes on each open), the audit log (written beside the
 * edit it records), and the SRP and vetting collections that share the
 * `corps/{id}` umbrella. Leaving a name out only costs a re-read; adding one that a client
 * caches would serve it stale.
 */
export const UNVERSIONED_COLLECTIONS: ReadonlySet<string> = new Set([
  'officers',
  'audit',
  'srp',
  'srpClaims',
  'srpAudit',
  'srpOfficers',
  'srpDoctrines',
  'srpThrottle',
  // Vetting shares the umbrella too; no client reads any of it (every read is a callable).
  'vetting',
  'vettingReviews',
  'vettingThrottle',
  // A server-side mirror of `observed` (corpTaxBookFeederRollup.ts); no client reads it.
  'feederObserved',
  // A running account's figures for the pay page (#6294); only the verify link reads them.
  'accounts',
  // The readers drain's own queue (corpTaxBookReaders.ts); no client reads it.
  'readersQueue',
]);

/**
 * The subcollections stamped all at once the first time a book is versioned (a
 * book from before this marker, or one just turned on): until then a missing
 * stamp would match a client's missing stamp. Any name outside this list is
 * stamped only once written, and a client never trusts a missing stamp.
 */
export const VERSIONED_COLLECTIONS = [
  MINERS,
  STATEMENTS,
  // Late notices and their verify links, and each Running account's closed-through checkpoint
  // (decision 20261120-235011).
  LATE_NOTICES,
  LATE_NOTICE_LINKS,
  RUNNING_ACCOUNT_CHECKPOINTS,
  PAYMENTS,
  DISMISSALS,
  EXTRACTIONS,
  OBSERVED,
  DECLARATIONS,
  ADJUSTMENTS,
  WRITE_OFFS,
  // An officer's per-day limit on forgiving a shortfall; a Miner reads their own.
  TOLERANCE_EXEMPTIONS,
  // A Miner's own copy of their paid-through day (`meta/paid` is officer-only).
  MINER_PAID,
  'feeders',
  META,
  // Server-built running totals per Miner (#5255, ADR 0032); the Miner page reads one (#5258).
  'minerTotals',
  // Server-built per-pull moon docs (#5256, ADR 0032); the moon page reads them (#5716).
  'moonDocs',
  // The server-built Overview and Miners list docs (#5259, ADR 0032).
  'readModels',
  // The member side (issue #5050) caches it too.
  'feederCoverage',
] as const;

export type VersionedCollection = (typeof VERSIONED_COLLECTIONS)[number];

/**
 * Bump when a field of a `readModels` doc changes meaning (#5259): the verifier then rewrites it
 * and a client ignores the old one. 2: built for Running accounts (decision 20261120-235011); the
 * Overview holds only its Extractions, and the Miners list only the ids of recorded accounts.
 */
export const READ_MODELS_SCHEMA = 2;

/**
 * Where a document or collection path lands in a book: its corporation id, and
 * the subcollection directly under `corps/{id}` (`null` for the book document
 * itself, `undefined` for anything that is not a book path).
 */
export function bookPathOf(
  path: string
): { corporationId: string; collection: string | null } | undefined {
  const parts = path.split('/');
  if (parts[0] !== 'corps' || parts.length < 2 || parts[1] === '') return undefined;
  return { corporationId: parts[1], collection: parts.length >= 3 ? parts[2] : null };
}

/**
 * Field on each `corps/{id}/observed/{rowId}`: a server timestamp set by every
 * merge that writes the row, so a client holding a copy reads only the rows
 * written since (src/features/corp/taxBook/observedDelta.ts). Rows from before
 * it lack the field; a client never trusts a delta over a copy it has no mark for.
 */
export const OBSERVED_UPDATED_AT_FIELD = 'updatedAt';
