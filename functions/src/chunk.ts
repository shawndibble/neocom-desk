// Lives in functions/src (deploy uploads functions/ alone); src re-exports it. Keep it import-free.
/** `items` split into consecutive batches of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
