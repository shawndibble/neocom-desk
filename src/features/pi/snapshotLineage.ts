/**
 * Which colony snapshots are one Character's colonies read again (a page
 * refresh, a Retry), as opposed to another Character's. A re-read is a new
 * object, so anything remembered per snapshot (the last advice, `useAdviceOf`)
 * would otherwise forget it and blank the board until the new answer lands.
 *
 * `usePiSnapshot` marks a re-read as it lands; a snapshot nobody marked is its
 * own lineage. The lineage is a bare token, never a snapshot, so a re-read does
 * not keep the snapshot it replaced alive.
 */
const tokens = new WeakMap<object, object>();

/** Records `next` as the same Character's colonies as `previous`, read again. */
export function markReRead(next: object, previous: object): void {
  if (next !== previous) tokens.set(next, lineageOf(previous));
}

/** One token per Character's run of re-reads, stable for every snapshot in it. */
export function lineageOf(snapshot: object): object {
  let token = tokens.get(snapshot);
  if (!token) tokens.set(snapshot, (token = {}));
  return token;
}
