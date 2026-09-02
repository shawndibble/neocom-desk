/**
 * Periodic Background Sync (ADR 0007, issue #176) isn't in TypeScript's DOM
 * lib yet — Chrome/Edge-only, no spec beyond the WICG draft. Minimal ambient
 * shape for both sides: `src/app/backgroundSync.ts` (registering, from the
 * page) and `src/sw.ts` (handling the `periodicsync` event, in the worker).
 */
interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface ServiceWorkerRegistration {
  readonly periodicSync?: PeriodicSyncManager;
}

interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string;
}

interface ServiceWorkerGlobalScopeEventMap {
  periodicsync: PeriodicSyncEvent;
}
