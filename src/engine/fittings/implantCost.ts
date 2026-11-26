export type ImplantSort = 'gain' | 'cost' | 'value';
export const IMPLANT_SORTS: readonly ImplantSort[] = ['gain', 'cost', 'value'];

export function costPerGain(cost: number | null, gain: number): number | null {
  return cost === null || !(gain > 0) ? null : cost / gain;
}

export function smallest(values: readonly (number | null)[]): number | null {
  return values.reduce<number | null>(
    (min, v) => (v === null || (min !== null && min <= v) ? min : v),
    null
  );
}

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
