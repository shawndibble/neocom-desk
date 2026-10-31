/** Caches `compute` per row object, so several export columns reading one derived figure work it out once per row. */
export function memoByRow<Row extends object, Result>(
  compute: (row: Row) => Result
): (row: Row) => Result {
  const cache = new WeakMap<Row, Result>();
  return (row) => {
    if (!cache.has(row)) cache.set(row, compute(row));
    return cache.get(row) as Result;
  };
}
