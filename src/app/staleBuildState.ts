/**
 * The stale-build recovery's in-flight state, alone in an import-free module.
 * `routeChunks.ts` (statically reachable from the boot shell preload, which
 * must stay light — `bootImportGraph.test.ts`) reads it to decide whether a
 * cancelled route import should wait for the reload; the recovery itself
 * (`staleBuildRecovery.ts`) writes it. Keeping it here stops that read from
 * dragging the recovery's env, probe and purge code into the boot graph.
 */

/** The recovery in flight (or finished and reloading); null when none has started or one aborted. */
let inFlight: Promise<boolean> | null = null;

/**
 * True while a recovery is running or has committed to reloading. Vite fires
 * `vite:preloadError` once per failed dependency (each CSS file, then the
 * module itself), so the handler must keep cancelling those follow-ups rather
 * than let them reject into the error boundary mid-recovery.
 */
export function isRecoveringFromStaleBuild(): boolean {
  return inFlight !== null;
}

/**
 * Settles with whether the page is reloading (`true`) or the recovery gave up
 * (`false`); null with none in flight. A route import the handler cancelled
 * resolves `undefined` meanwhile (Vite's preload helper), and `guarded` waits
 * on this: a reload means stay pending, an abort means reject into the boundary.
 */
export function staleBuildRecoveryOutcome(): Promise<boolean> | null {
  return inFlight;
}

export function setStaleBuildRecovery(attempt: Promise<boolean> | null): void {
  inFlight = attempt;
}
