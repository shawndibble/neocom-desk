export interface CorpRows<T> {
  corporationId: number;
  rows: readonly T[];
}

export interface MergedCorpRows<T> {
  rows: T[];
  corporationOf: Map<string, number>;
}

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

export function mergeLookups<K, V>(maps: readonly ReadonlyMap<K, V>[]): Map<K, V> {
  return new Map(maps.flatMap((map) => [...map]));
}
