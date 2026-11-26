let pending = false;

export function markStoresStale(): void {
  pending = true;
}

export function consumeStaleStores(): boolean {
  const was = pending;
  pending = false;
  return was;
}
