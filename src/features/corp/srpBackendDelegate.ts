/**
 * Binds a client's exported function to one op of its backend, picked at call time
 * (`override ?? real`), so the public signature is the op's own.
 */
export const delegate =
  <B extends object>(backend: () => B) =>
  <K extends keyof B>(op: K) =>
  (
    ...args: B[K] extends (...a: infer A) => unknown ? A : never
  ): B[K] extends (...a: never[]) => infer R ? R : never =>
    (backend()[op] as (...a: unknown[]) => never)(...args);
