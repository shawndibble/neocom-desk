import { runBootUpdate, type BootUpdateOutcome } from './bootUpdate';

let pending: Promise<BootUpdateOutcome> | undefined;

export function bootUpdateOnce(): Promise<BootUpdateOutcome> {
  pending ??= runBootUpdate().catch((): BootUpdateOutcome => 'current');
  return pending;
}

export function resetBootUpdateForTest() {
  pending = undefined;
}
