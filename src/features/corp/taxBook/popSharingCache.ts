/**
 * One read of a book's Pop Sharing settings shared by every list that marks them (the
 * Extractions, Overview, Moon owners and Sharing tabs, and the Moon extractions widget), so
 * opening the Moons page reads `meta/popSharing` once rather than once per mounted list. Held
 * for a few minutes (another officer may edit it), dropped at once when this device edits it
 * (`invalidatePopSharing`), which tells every mounted list to read again. A failed read is
 * not cached, so the next caller tries again.
 */
import type { PopSharingDoc } from '../../../../functions/src/popSharing';
import { MINUTE_MS } from '@/lib/age';
import { registerTestReset } from '@/lib/testResets';
import { readPopSharing } from './popSharingClient';

export const POP_SHARING_CACHE_MS = 5 * MINUTE_MS;

const cache = new Map<number, { at: number; doc: Promise<PopSharingDoc> }>();
const listeners = new Set<(corporationId: number) => void>();
registerTestReset(() => {
  cache.clear();
  listeners.clear();
});

/** The book's settings, read once per window whichever officer Character asks. */
export function readPopSharingCached(
  characterId: number,
  corporationId: number,
  now: number = Date.now()
): Promise<PopSharingDoc> {
  const hit = cache.get(corporationId);
  if (hit && now - hit.at < POP_SHARING_CACHE_MS) return hit.doc;
  const entry = { at: now, doc: readPopSharing(characterId, corporationId) };
  cache.set(corporationId, entry);
  entry.doc.catch(() => {
    if (cache.get(corporationId) === entry) cache.delete(corporationId);
  });
  return entry.doc;
}

/** Drops the book's cached settings and tells every mounted list to read them again. */
export function invalidatePopSharing(corporationId: number): void {
  cache.delete(corporationId);
  for (const listener of listeners) listener(corporationId);
}

/** Hears each invalidation; returns the unsubscribe. */
export function onPopSharingInvalidated(listener: (corporationId: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
