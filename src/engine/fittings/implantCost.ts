/**
 * Small pure comparisons the Implant Finder's cards share: what one source
 * saves over another, what a gain costs per unit, and a stable sort that
 * leaves the unpriced last.
 */
import type { Source } from './implantSources';

/** How the finder orders what helps: biggest gain, lowest cost, lowest cost per unit of gain. */
export type ImplantSort = 'gain' | 'cost' | 'value';
export const IMPLANT_SORTS: readonly ImplantSort[] = ['gain', 'cost', 'value'];

/** The cheaper of two priced sources and the difference; null if either is unpriced or they tie. */
export function savingBetween(a: Source, b: Source): { cheaper: Source; saving: number } | null {
  if (a.cost === null || b.cost === null || a.cost === b.cost) return null;
  return a.cost < b.cost
    ? { cheaper: a, saving: b.cost - a.cost }
    : { cheaper: b, saving: a.cost - b.cost };
}

/** ISK per unit of gain; null without a price or when nothing is gained. */
export function costPerGain(cost: number | null, gain: number): number | null {
  return cost === null || !(gain > 0) ? null : cost / gain;
}

/** Ascending by key, ties keep their order, a null key sorts after every number. */
export function orderBy<T>(items: readonly T[], key: (item: T) => number | null): T[] {
  return items
    .map((item, index) => ({ item, index, k: key(item) }))
    .sort((x, y) => {
      if (x.k === y.k) return x.index - y.index;
      if (x.k === null) return 1;
      if (y.k === null) return -1;
      return x.k - y.k || x.index - y.index;
    })
    .map((entry) => entry.item);
}
