/**
 * Firestore refuses a query whose index is not deployed yet with
 * `failed-precondition`. `firestore.indexes.json` is deployed by hand, so a
 * client running this code before that lands must not simply fail: the caller
 * falls back to the unfiltered read it used to do (collection sync also records
 * the pass as a full read, so nothing is missed).
 */
export function isMissingIndex(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'failed-precondition';
}
