/**
 * P0 resources keyed by type id, built once per `PiData`. `pi.raw` is an
 * array, so a per-node `find` is O(raw) each; callers share this Map instead.
 *
 * Pure: the cache is keyed on the payload object itself.
 */
import type { PiData, PiRawResource } from '@/sde/types';

const cache = new WeakMap<PiData, ReadonlyMap<number, PiRawResource>>();

export function rawById(pi: PiData): ReadonlyMap<number, PiRawResource> {
  let index = cache.get(pi);
  if (!index) {
    index = new Map(pi.raw.map((r) => [r.typeID, r]));
    cache.set(pi, index);
  }
  return index;
}
