import type { BookFeeder } from '../taxBook/bookClient';

/** Why a chunk's ore is unknown, when the book knows. */
export type OreUnknownCause = { kind: 'owner-grant'; corporationId: number };

/**
 * The known reason a chunk shows "Ore unknown": its moon owner's grant does not read the
 * Extraction started notifications, so only that moon owner granting again brings the ore. Null
 * when the cause is not known (the book's own chunk, a grant that reads them, or one no sync has
 * said about yet): the notice may simply never have come.
 */
export function oreUnknownCause(
  row: { sourceCorporationId?: number },
  feeders: readonly Pick<BookFeeder, 'corporationId' | 'readsNotifications'>[] | undefined
): OreUnknownCause | null {
  const id = row.sourceCorporationId;
  if (id === undefined) return null;
  const owner = feeders?.find((f) => f.corporationId === id);
  return owner?.readsNotifications === false ? { kind: 'owner-grant', corporationId: id } : null;
}
