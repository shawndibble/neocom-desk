/**
 * Module state a test must never inherit from the one before it — a cache, or
 * a flag like "Fuzzwork is down" — registered by the module that owns it.
 * `vitest.setup.ts` runs every registered reset before each test, so no test
 * file has to remember which modules its code reaches.
 *
 * A registry rather than the setup file importing each module: an import there
 * would load the module (and what it imports) before a test file's `vi.mock`,
 * so the file's mocks would miss it. Here only modules the test actually loaded
 * are reset. Kept on `globalThis` so a module re-imported after
 * `vi.resetModules()` still reaches the setup file's copy.
 *
 * In production nothing runs the resets; registering is one `Set.add`.
 */
const KEY = Symbol.for('neocom-desk.testResets');

function registry(): Set<() => void> {
  const scope = globalThis as unknown as Record<symbol, Set<() => void> | undefined>;
  return (scope[KEY] ??= new Set());
}

/** Registers a test-only reset of module state, run before every test. */
export function registerTestReset(reset: () => void): void {
  registry().add(reset);
}

/** Runs every registered reset. Called by `vitest.setup.ts` before each test. */
export function runTestResets(): void {
  for (const reset of registry()) reset();
}
