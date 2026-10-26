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

/**
 * Subcollections whose writes never change what a client caches, so they move
 * no stamp: officer access records (rewritten on every officer check, which
 * the officer page makes on each open), the audit log (written beside the
 * edit it records), and the SRP collections that share the `corps/{id}`
 * umbrella. Leaving a name out only costs a re-read; adding one that a client
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
]);

/**
 * The subcollections stamped all at once the first time a book is versioned (a
 * book from before this marker, or one just turned on): until then a missing
 * stamp would match a client's missing stamp. Any name outside this list is
 * stamped only once written, and a client never trusts a missing stamp.
 */
export const VERSIONED_COLLECTIONS = [
  'miners',
  'statements',
  'payments',
  'dismissals',
  'extractions',
  'observed',
  'declarations',
  'adjustments',
  'writeOffs',
  'feeders',
  'meta',
  // The member side (issue #5050) caches it too.
  'feederCoverage',
] as const;

export type VersionedCollection = (typeof VERSIONED_COLLECTIONS)[number];

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
