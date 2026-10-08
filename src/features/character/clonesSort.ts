import type { JumpsAwayResult } from '@/engine/jumpsAway';
import { createLocalSetting } from '@/lib/useLocalSetting';

export type ClonesSort = 'training' | 'nearest' | 'value';
export const CLONES_SORTS: readonly ClonesSort[] = ['training', 'nearest', 'value'];

/** The jump-clone list order, remembered on this device like other list preferences. */
export const useClonesSort = createLocalSetting<ClonesSort>({
  key: 'clonesSort',
  defaultValue: 'training',
  parse: (raw) => ((CLONES_SORTS as readonly unknown[]).includes(raw) ? (raw as ClonesSort) : null),
});

export interface SortableClone {
  id: string | number;
  locationId: number;
  /** Seconds sooner (negative) or later than the worn clone; null with no verdict. */
  deltaSeconds: number | null;
  /** Total hub value of the implants; null until priced. */
  value: number | null;
}

/**
 * Orders the jump clones (the worn clone is pinned first by the caller). The
 * unknown always goes last, and ties keep the Character's own clone order.
 */
export function sortClones<T extends SortableClone>(
  clones: readonly T[],
  sort: ClonesSort,
  jumps: ReadonlyMap<number, JumpsAwayResult> | undefined
): T[] {
  const key = (c: T): number | null => {
    if (sort === 'training') return c.deltaSeconds;
    if (sort === 'value') return c.value === null ? null : -c.value;
    const j = jumps?.get(c.locationId);
    return j?.kind === 'known' ? j.jumps : null;
  };
  return clones
    .map((c, index) => ({ c, index, k: key(c) }))
    .sort((a, b) => {
      if (a.k === null || b.k === null) {
        if (a.k === b.k) return a.index - b.index;
        return a.k === null ? 1 : -1;
      }
      return a.k - b.k || a.index - b.index;
    })
    .map((x) => x.c);
}
