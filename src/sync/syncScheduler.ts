import { isOnline } from '@/stores/network';
import { reportFailure } from '@/observability/reportFailure';
import { clearSyncScheduled, setStatus, setSyncScheduled } from './status';
import type { SyncedCollectionName } from './syncedCollections';

export type SyncScope = ReadonlySet<SyncedCollectionName> | 'all';

function unionScope(a: SyncScope | null, b: SyncScope): SyncScope {
  if (a === null) return b;
  if (a === 'all' || b === 'all') return 'all';
  return new Set([...a, ...b]);
}

function scopeOf(collections: readonly SyncedCollectionName[] | undefined): SyncScope {
  return collections === undefined || collections.length === 0 ? 'all' : new Set(collections);
}

export const PARTIAL_PASS_WINDOW_MS = 5 * 60 * 1000;

interface SyncJob {
  characterId: number;
  priority: SyncPriority;
  scope: SyncScope;
  started: boolean;
  rerun: { priority: SyncPriority; scope: SyncScope } | null;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export type SyncPriority = 'foreground' | 'background';

function higher(a: SyncPriority | null, b: SyncPriority): SyncPriority {
  return a === 'foreground' || b === 'foreground' ? 'foreground' : 'background';
}

const DEFAULT_DEBOUNCE_MS = 2000;

export interface ScheduleSyncOptions {
  collections?: readonly SyncedCollectionName[];
  debounceMs?: number;
  priority?: SyncPriority;
}

export interface SyncScheduler {
  scheduleSync: (characterId: number, options?: number | ScheduleSyncOptions) => void;
  triggerSync: (characterId: number, priority?: SyncPriority) => Promise<void>;
  haltSync: () => Promise<void>;
  resetSyncHalt: () => void;
}

export function createSyncScheduler(
  runCharacterPass: (
    characterId: number,
    scope: SyncScope,
    priority: SyncPriority
  ) => Promise<SyncScope | void>,
  { now = Date.now }: { now?: () => number } = {}
): SyncScheduler {
  const running = new Map<number, SyncJob>();
  const pendingTimers = new Map<
    number,
    { timer: ReturnType<typeof setTimeout>; priority: SyncPriority; scope: SyncScope }
  >();
  const lastFullPullAt = new Map<number, number>();

  const queue: SyncJob[] = [];
  let busy = false;
  let halted = false;

  function finish(job: SyncJob, error?: { error: unknown }): void {
    if (running.get(job.characterId) === job) running.delete(job.characterId);
    if (error) job.reject(error.error);
    else job.resolve();
  }

  function pump(): void {
    while (!busy && queue.length > 0) {
      const foreground = queue.findIndex((job) => job.priority === 'foreground');
      const [job] = queue.splice(foreground === -1 ? 0 : foreground, 1);
      if (halted) {
        finish(job);
        continue;
      }
      busy = true;
      job.started = true;
      void runPass(job);
    }
  }

  function effectiveScope(characterId: number, scope: SyncScope, startedAt: number): SyncScope {
    if (scope === 'all') return 'all';
    const fullAt = lastFullPullAt.get(characterId);
    return fullAt !== undefined && startedAt - fullAt <= PARTIAL_PASS_WINDOW_MS ? scope : 'all';
  }

  async function runPass(job: SyncJob): Promise<void> {
    const { characterId } = job;
    const startedAt = now();
    const scope = effectiveScope(characterId, job.scope, startedAt);
    let failure: { error: unknown } | undefined;
    setStatus(characterId, { state: 'syncing', error: null, offline: false });
    try {
      const ran = (await runCharacterPass(characterId, scope, job.priority)) ?? scope;
      const full = ran === 'all';
      if (full) lastFullPullAt.set(characterId, startedAt);
      const finishedAt = now();
      setStatus(characterId, {
        state: 'idle',
        lastSyncedAt: finishedAt,
        ...(full ? { lastFullSyncAt: finishedAt } : {}),
        error: null,
        offline: false,
      });
    } catch (error) {
      failure = { error };
      lastFullPullAt.delete(characterId);
      reportFailure('sync', error);
      setStatus(characterId, {
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
        offline: !isOnline(),
      });
    } finally {
      busy = false;
      if (job.rerun !== null && !halted) {
        job.priority = job.rerun.priority;
        job.scope = job.rerun.scope;
        job.rerun = null;
        job.started = false;
        queue.push(job);
      } else {
        finish(job, failure);
      }
      pump();
    }
  }

  async function haltSync(): Promise<void> {
    halted = true;
    lastFullPullAt.clear();
    for (const { timer } of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
    clearSyncScheduled();
    for (const job of queue.splice(0)) finish(job);
    await Promise.allSettled([...running.values()].map((job) => job.promise));
  }

  function resetSyncHalt(): void {
    halted = false;
  }

  function scheduleSync(characterId: number, options: number | ScheduleSyncOptions = {}): void {
    if (halted) return;
    const {
      debounceMs = DEFAULT_DEBOUNCE_MS,
      priority = 'foreground',
      collections,
    } = typeof options === 'number' ? { debounceMs: options } : options;
    const existing = pendingTimers.get(characterId);
    if (existing !== undefined) clearTimeout(existing.timer);
    const merged = higher(existing?.priority ?? null, priority);
    const scope = unionScope(existing?.scope ?? null, scopeOf(collections));
    setSyncScheduled(characterId, merged === 'foreground');
    pendingTimers.set(characterId, {
      priority: merged,
      scope,
      timer: setTimeout(() => {
        pendingTimers.delete(characterId);
        setSyncScheduled(characterId, false);
        requestSync(characterId, merged, scope).catch(() => {});
      }, debounceMs),
    });
  }

  function triggerSync(characterId: number, priority: SyncPriority = 'foreground'): Promise<void> {
    return requestSync(characterId, priority, 'all');
  }

  function requestSync(
    characterId: number,
    priority: SyncPriority,
    scope: SyncScope
  ): Promise<void> {
    if (halted) return Promise.resolve();
    const pending = pendingTimers.get(characterId);
    if (pending !== undefined) {
      clearTimeout(pending.timer);
      pendingTimers.delete(characterId);
      setSyncScheduled(characterId, false);
      priority = higher(pending.priority, priority);
      scope = unionScope(pending.scope, scope);
    }
    const existing = running.get(characterId);
    if (existing) {
      if (existing.started) {
        existing.rerun = {
          priority: higher(existing.rerun?.priority ?? null, priority),
          scope: unionScope(existing.rerun?.scope ?? null, scope),
        };
      } else {
        existing.priority = higher(existing.priority, priority);
        existing.scope = unionScope(existing.scope, scope);
      }
      return existing.promise;
    }

    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job: SyncJob = {
      characterId,
      priority,
      scope,
      started: false,
      rerun: null,
      promise,
      resolve,
      reject,
    };
    running.set(characterId, job);
    queue.push(job);
    pump();
    return promise;
  }

  return { scheduleSync, triggerSync, haltSync, resetSyncHalt };
}
