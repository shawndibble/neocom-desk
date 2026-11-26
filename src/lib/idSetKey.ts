export function idSetKey(ids: Iterable<number>): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(',');
}
