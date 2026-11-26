export const SLICE_MS = 30;

export function runSliced<T>(
  todo: readonly T[],
  step: (item: T) => boolean | void,
  onSlice: (landed: boolean, done: boolean) => void
): () => void {
  const queue = [...todo];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slice = () => {
    const start = performance.now();
    let landed = false;
    while (queue.length > 0 && performance.now() - start < SLICE_MS) {
      if (step(queue.shift()!) !== false) landed = true;
    }
    onSlice(landed, queue.length === 0);
    if (queue.length > 0) timer = setTimeout(slice, 0);
  };
  timer = setTimeout(slice, 0);
  return () => clearTimeout(timer);
}
