import type { BookFeeder } from '../taxBook/bookClient';

export type OreUnknownCause = { kind: 'owner-grant'; corporationId: number };

export function oreUnknownCause(
  row: { sourceCorporationId?: number },
  feeders: readonly Pick<BookFeeder, 'corporationId' | 'readsNotifications'>[] | undefined
): OreUnknownCause | null {
  const id = row.sourceCorporationId;
  if (id === undefined) return null;
  const owner = feeders?.find((f) => f.corporationId === id);
  return owner?.readsNotifications === false ? { kind: 'owner-grant', corporationId: id } : null;
}
