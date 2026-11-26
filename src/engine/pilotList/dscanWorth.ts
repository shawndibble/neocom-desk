export interface HullCount {
  typeId: number;
  count: number;
}

export interface WorthLine {
  typeId: number;
  count: number;
  unit: number | null;
  total: number | null;
}

export interface Worth {
  lines: WorthLine[];
  total: number;
  unpriced: number;
}

export function buildWorth(
  hulls: readonly HullCount[],
  prices: ReadonlyMap<number, number | null>
): Worth {
  let total = 0;
  let unpriced = 0;
  const lines = hulls.map(({ typeId, count }): WorthLine => {
    const unit = prices.get(typeId) ?? null;
    if (unit === null) {
      unpriced += count;
      return { typeId, count, unit: null, total: null };
    }
    total += unit * count;
    return { typeId, count, unit, total: unit * count };
  });
  lines.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  return { lines, total, unpriced };
}

export interface HullDelta {
  typeId: number;
  delta: number;
}

export function diffHulls(
  current: readonly HullCount[],
  previous: readonly HullCount[]
): HullDelta[] {
  const delta = new Map<number, number>();
  for (const { typeId, count } of current) delta.set(typeId, (delta.get(typeId) ?? 0) + count);
  for (const { typeId, count } of previous) delta.set(typeId, (delta.get(typeId) ?? 0) - count);
  return [...delta]
    .filter(([, d]) => d !== 0)
    .map(([typeId, d]) => ({ typeId, delta: d }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.typeId - b.typeId);
}

export function sameHulls(a: readonly HullCount[], b: readonly HullCount[]): boolean {
  return a.length === b.length && diffHulls(a, b).length === 0;
}
