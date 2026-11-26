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
