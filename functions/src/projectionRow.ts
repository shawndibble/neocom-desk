// Kept in its own dependency-free module so `dispatchProjections.ts` (and
// the root parity test that imports it) need not pull in `registerDevice.ts`'s
// `jose` import just for a type.

/**
 * One Scheduled Push occurrence (issue #358, ADR 0010), as uploaded by the
 * client. Mirrors `src/engine/projection.ts`'s `ProjectionRow` but is kept as
 * its own local type rather than imported: this package holds no SDE and no
 * i18n catalog, and never re-derives what the fields mean — it only stores
 * and later replays already-rendered text, so `eventId` is validated as a
 * non-empty string here, not against the frontend's closed event-id union.
 */
export interface ProjectionRowInput {
  eventId: string;
  occurrenceKey: string;
  fireAt: number;
  title: string;
  body: string;
  /** The raw ESI type underneath an `eveNotification` row (issue #274's per-type opt-out); absent for every other eventId. */
  eveType?: string;
}
