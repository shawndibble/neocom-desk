const KEY = Symbol.for('neocom-desk.testResets');

function registry(): Set<() => void> {
  const scope = globalThis as unknown as Record<symbol, Set<() => void> | undefined>;
  return (scope[KEY] ??= new Set());
}

export function registerTestReset(reset: () => void): void {
  registry().add(reset);
}

export function runTestResets(): void {
  for (const reset of registry()) reset();
}
