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

export function seedPopSharing(corporationId: number, doc: PopSharingDoc): void {
  cache.set(corporationId, { at: Date.now(), doc: Promise.resolve(doc) });
}

export function invalidatePopSharing(corporationId: number): void {
  cache.delete(corporationId);
  for (const listener of listeners) listener(corporationId);
}

export function onPopSharingInvalidated(listener: (corporationId: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
