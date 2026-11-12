/**
 * Several corporations' reads of one Corp Board widget as one (All scope).
 * Pure: the widget's builder sorts and totals the merged rows as it does one
 * corporation's, so the order and the sums hold across corporations.
 */

/** One corporation's rows. */
export interface CorpRows<T> {
  corporationId: number;
  rows: readonly T[];
}

export interface MergedCorpRows<T> {
  rows: T[];
  /** Each row's corporation, by the widget's row key. */
  corporationOf: Map<string, number>;
}

/**
 * Every corporation's rows in read order, each one's corporation carried by its
 * key. A row two reads share (a contract between two of the pilot's
 * corporations) is kept once, under the first, so it is not counted twice.
 */
export function mergeCorpRows<T>(
  reads: readonly CorpRows<T>[],
  keyOf: (row: T) => string
): MergedCorpRows<T> {
  const rows: T[] = [];
  const corporationOf = new Map<string, number>();
  for (const { corporationId, rows: own } of reads) {
    for (const row of own) {
      const key = keyOf(row);
      if (corporationOf.has(key)) continue;
      corporationOf.set(key, corporationId);
      rows.push(row);
    }
  }
  return { rows, corporationOf };
}

/** Name and price lookups of several reads as one; the same id names the same thing in each. */
export function mergeLookups<K, V>(maps: readonly ReadonlyMap<K, V>[]): Map<K, V> {
  return new Map(maps.flatMap((map) => [...map]));
}
