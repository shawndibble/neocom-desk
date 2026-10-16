import type { CorpBoardItemKind } from '@/engine/corp/board';

/** The three corp reads a Kind Card is built from; `null` is "could not be read". */
export interface CorpCardSources {
  structures: unknown[] | null;
  extractions: unknown[] | null;
  jobs: unknown[] | null;
}

/**
 * The card kinds whose own read produced nothing to judge from.
 *
 * `null` is the loader's "this read did not happen or failed" (see `CorpSnapshot`
 * in `routes/Corp.tsx`), as opposed to `[]`, "read fine, nothing there". A kind
 * whose capability is not held is also `null`, but `CorpKindCards` gates on the
 * capability first, so only a kind the Character *can* read ever lands here as a
 * "couldn't load" card. No snapshot at all (the whole load failed) is every kind.
 */
export function unreadableCardKinds(
  sources: CorpCardSources | null
): ReadonlySet<CorpBoardItemKind> {
  const kinds = new Set<CorpBoardItemKind>();
  if (sources === null || sources.structures === null) {
    kinds.add('structureFuel');
    kinds.add('structureTimer');
  }
  if (sources === null || sources.extractions === null) kinds.add('moonExtraction');
  if (sources === null || sources.jobs === null) kinds.add('jobDelivery');
  return kinds;
}
