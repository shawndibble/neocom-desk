/**
 * What the module browser's whole-catalogue hull check is cached under, and
 * which racks it needn't ask the engine about at all (`useHullFit`).
 */
import type { CandidateRack } from './candidates';
import type { FittingSlotKind } from './types';

type Check = { fitsHull: boolean; canFly: boolean; fitsResources: boolean };

/**
 * The pilot's skills as a short text key: the hull check only reads
 * `skillLevels`, so two profiles with the same skills share one answer even
 * across a reload, where object identity no longer does. A 53-bit hash
 * (cyrb53) over the sorted `id:level` pairs, plus their count.
 */
export function skillsKey(skillLevels: ReadonlyMap<number, number>): string {
  const text = [...skillLevels.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, level]) => `${id}:${level}`)
    .join(',');
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `${skillLevels.size}-${hash.toString(36)}`;
}

/**
 * The racks worth checking on a hull: those it has a slot in, plus the drone
 * bay (whose room isn't a slot count). An item in a rack with no slots can
 * only ever fail the hull's rules, so it is answered without the engine.
 */
export function racksWithSlots(slotCounts: Record<FittingSlotKind, number>): Set<CandidateRack> {
  const racks = new Set<CandidateRack>(['drone']);
  for (const [rack, count] of Object.entries(slotCounts)) {
    if (count > 0) racks.add(rack as FittingSlotKind);
  }
  return racks;
}

/** A check as one small integer — what a worker reply and a saved row carry. */
export function packCheck(check: Check): number {
  return (check.fitsHull ? 1 : 0) | (check.canFly ? 2 : 0) | (check.fitsResources ? 4 : 0);
}

export function unpackCheck(bits: number): Check {
  return { fitsHull: (bits & 1) !== 0, canFly: (bits & 2) !== 0, fitsResources: (bits & 4) !== 0 };
}
