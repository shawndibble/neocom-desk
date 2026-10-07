/**
 * In-memory flag: preference stores hold values whose Dexie rows were deleted
 * ("Reset view prefs"), so a reload is owed. Never persisted — a page load
 * re-hydrates every store, which settles the debt.
 */
let pending = false;

export function markStoresStale(): void {
  pending = true;
}

/** True once per `markStoresStale`, then false until it is marked again. */
export function consumeStaleStores(): boolean {
  const was = pending;
  pending = false;
  return was;
}
