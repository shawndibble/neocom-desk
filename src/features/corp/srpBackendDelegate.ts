/**
 * Picks the backend (`override ?? real`) at call time so the public signature stays the op's own.
 */
export const delegate =
  <B extends object>(backend: () => B) =>
  <K extends keyof B>(op: K) =>
  (
    ...args: B[K] extends (...a: infer A) => unknown ? A : never
  ): B[K] extends (...a: never[]) => infer R ? R : never =>
    (backend()[op] as (...a: unknown[]) => never)(...args);
