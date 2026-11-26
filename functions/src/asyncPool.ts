export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  shouldStop: () => boolean = () => false
): Promise<void> {
  let next = 0;
  let firstError: { error: unknown } | undefined;
  const lane = async () => {
    while (next < items.length && !shouldStop()) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (error) {
        firstError ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  if (firstError) throw firstError.error;
}
