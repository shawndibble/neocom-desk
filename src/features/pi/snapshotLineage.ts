/**
 * Which colony snapshots are one pilot's colonies read again (a page refresh,
 * a Retry), as opposed to another pilot's. A re-read is a new object, so
 * anything remembered per snapshot (the last advice, `useAdviceOf`) would
 * otherwise forget it and blank the board until the new answer lands.
 *
 * `usePiSnapshot` marks a re-read as it lands; a snapshot nobody marked is its
 * own lineage.
 */
const lineage = new WeakMap<object, object>();

/** Records `next` as the same pilot's colonies as `previous`, read again. */
export function markReRead(next: object, previous: object): void {
  if (next !== previous) lineage.set(next, lineageOf(previous));
}

/** One object per pilot's run of re-reads: the first snapshot of the run. */
export function lineageOf(snapshot: object): object {
  return lineage.get(snapshot) ?? snapshot;
}
