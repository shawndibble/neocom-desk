// The global sync queue: one Firebase session, so one pass at a time, with
// per-Character coalescing, foreground-over-background priority, a debounce
// for edits and a page-lifetime halt. What a pass *does* is injected
// (`runPass`), so this module knows nothing of Firestore and planSync.ts can
// own the pass without an import cycle.
import { isOnline } from '@/stores/network';
import { clearSyncScheduled, setStatus, setSyncScheduled } from './status';

/**
 * One Character's sync, from the moment it is requested until its promise
 * settles. It may run more than one pass: a request that arrives after a pass
 * has started (`started`) cannot be served by it — the pass may already have
 * read the local rows the request is about — so it sets `rerun` and the job
 * goes back in the queue once the pass ends. Callers keep awaiting the one
 * promise, so `flushSync` (features/character/removeCharacter.ts) never deletes
 * a Character's rows before an edit made mid-pass has actually been pushed.
 */
interface SyncJob {
  characterId: number;
  priority: SyncPriority;
  started: boolean;
  rerun: SyncPriority | null;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

/**
 * `foreground` is everything a user is waiting on — an edit, the boot sync, a
 * Character switch. `background` is the sweep (`app/backgroundSync.ts`), which
 * may queue one sync per Character: a foreground sync overtakes every queued
 * background one, so an edit waits for at most the one sync already in
 * flight, never the whole sweep.
 */
export type SyncPriority = 'foreground' | 'background';

function higher(a: SyncPriority | null, b: SyncPriority): SyncPriority {
  return a === 'foreground' || b === 'foreground' ? 'foreground' : 'background';
}

const DEFAULT_DEBOUNCE_MS = 2000;

export interface SyncScheduler {
  /** Debounced sync — call after each edit. `background` is for the sweep only. */
  scheduleSync: (characterId: number, debounceMs?: number, priority?: SyncPriority) => void;
  /** Run a sync now, serialized globally and coalesced per Character. */
  triggerSync: (characterId: number, priority?: SyncPriority) => Promise<void>;
  /** Stop syncing on this page until it reloads. Resolves once the sync in flight is done. */
  haltSync: () => Promise<void>;
  /** Undo `haltSync`. Tests only — the app reloads instead. */
  resetSyncHalt: () => void;
}

/** `runCharacterPass` is one Character's whole sync; it rejects on failure. */
export function createSyncScheduler(
  runCharacterPass: (characterId: number) => Promise<void>
): SyncScheduler {
  const running = new Map<number, SyncJob>();
  const pendingTimers = new Map<
    number,
    { timer: ReturnType<typeof setTimeout>; priority: SyncPriority }
  >();

  /** Syncs waiting their turn, FIFO within each priority. */
  const queue: SyncJob[] = [];
  /** True while a sync holds the (single) Firebase session. */
  let busy = false;
  // Set by `haltSync` for the rest of the page's life: a purge-then-wipe must
  // not race a sync that pushes the purged rows back or re-mints a session.
  let halted = false;

  function finish(job: SyncJob, error?: { error: unknown }): void {
    if (running.get(job.characterId) === job) running.delete(job.characterId);
    if (error) job.reject(error.error);
    else job.resolve();
  }

  /**
   * Start the next queued sync — foreground first — unless one is running.
   * After `haltSync` a queued job is settled without running: it would only
   * push data the halt is about to purge.
   */
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

  async function runPass(job: SyncJob): Promise<void> {
    const { characterId } = job;
    let failure: { error: unknown } | undefined;
    setStatus(characterId, { state: 'syncing', error: null, offline: false });
    try {
      await runCharacterPass(characterId);
      setStatus(characterId, {
        state: 'idle',
        lastSyncedAt: Date.now(),
        error: null,
        offline: false,
      });
    } catch (error) {
      failure = { error };
      setStatus(characterId, {
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
        // A failure while the browser is offline is the network's, not the sync's.
        offline: !isOnline(),
      });
    } finally {
      busy = false;
      if (job.rerun !== null && !halted) {
        job.priority = job.rerun;
        job.rerun = null;
        job.started = false;
        queue.push(job);
      } else {
        finish(job, failure);
      }
      pump();
    }
  }

  /**
   * Stop syncing on this page until it reloads: pending debounces are dropped,
   * new syncs are refused, queued ones are skipped, and this resolves once the
   * sync in flight (if any) is done.
   */
  async function haltSync(): Promise<void> {
    halted = true;
    for (const { timer } of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
    clearSyncScheduled();
    // Not-yet-started jobs settle now, without running.
    for (const job of queue.splice(0)) finish(job);
    await Promise.allSettled([...running.values()].map((job) => job.promise));
  }

  /** Undo `haltSync`. Tests only — the app reloads instead. */
  function resetSyncHalt(): void {
    halted = false;
  }

  /**
   * Debounced sync — call after each edit. `background` is for the sweep only;
   * a foreground call for the same Character inside the debounce wins.
   */
  function scheduleSync(
    characterId: number,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    priority: SyncPriority = 'foreground'
  ): void {
    if (halted) return;
    const existing = pendingTimers.get(characterId);
    if (existing !== undefined) clearTimeout(existing.timer);
    const merged = higher(existing?.priority ?? null, priority);
    // Only an edit counts: the background sweep schedules every Character.
    setSyncScheduled(characterId, merged === 'foreground');
    pendingTimers.set(characterId, {
      priority: merged,
      timer: setTimeout(() => {
        pendingTimers.delete(characterId);
        setSyncScheduled(characterId, false);
        triggerSync(characterId, merged).catch(() => {
          // Failure already surfaced via subscribeSyncStatus.
        });
      }, debounceMs),
    });
  }

  /**
   * Run a sync now, serialized globally. Coalesced per character: a queued sync
   * for it is awaited instead (promoted to foreground when this call is), and
   * one already running is awaited *through one more pass*, since it may have
   * read the local rows before whatever edit prompted this call.
   */
  function triggerSync(characterId: number, priority: SyncPriority = 'foreground'): Promise<void> {
    if (halted) return Promise.resolve();
    const pending = pendingTimers.get(characterId);
    if (pending !== undefined) {
      clearTimeout(pending.timer);
      pendingTimers.delete(characterId);
      setSyncScheduled(characterId, false);
      priority = higher(pending.priority, priority);
    }
    const existing = running.get(characterId);
    if (existing) {
      if (existing.started) existing.rerun = higher(existing.rerun, priority);
      else existing.priority = higher(existing.priority, priority);
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
