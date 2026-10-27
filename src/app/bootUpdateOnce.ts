import { runBootUpdate, type BootUpdateOutcome } from './bootUpdate';

// One boot update per page load, however many times StrictMode mounts the gate.
let pending: Promise<BootUpdateOutcome> | undefined;

export function bootUpdateOnce(): Promise<BootUpdateOutcome> {
  pending ??= runBootUpdate().catch((): BootUpdateOutcome => 'current');
  return pending;
}

/** Test seam: forget the memoised boot update. */
export function resetBootUpdateForTest() {
  pending = undefined;
}
