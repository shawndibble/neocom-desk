/**
 * What a sync pull changed in an Editable Data table, for a feature that keeps something derived
 * from its rows (Mining Tax's device checkpoints of the Payees' Running accounts). The sync
 * engine only says which rows changed; it knows nothing of who listens. Dexie-free and
 * Firebase-free, so a feature can subscribe without pulling the sync bundle in.
 */

/** The rows a pull wrote or removed, in their local shape; `before` is a changed row's old copy. */
export interface RecordsChange<R = unknown> {
  upserted: readonly R[];
  before: readonly R[];
  deleted: readonly R[];
}

type Listener = (change: RecordsChange) => Promise<void> | void;

const listeners = new Map<string, Set<Listener>>();

/** Hears every pull that changes rows of `table`. Returns the unsubscribe. */
export function subscribeRecordsChanged<R>(
  table: string,
  listener: (change: RecordsChange<R>) => Promise<void> | void
): () => void {
  const set = listeners.get(table) ?? new Set<Listener>();
  set.add(listener as Listener);
  listeners.set(table, set);
  return () => set.delete(listener as Listener);
}

/** Tells `table`'s listeners what a pull changed; a listener's failure never fails the pull. */
export async function notifyRecordsChanged(table: string, change: RecordsChange): Promise<void> {
  for (const listener of listeners.get(table) ?? [])
    await Promise.resolve(listener(change)).catch(() => undefined);
}
