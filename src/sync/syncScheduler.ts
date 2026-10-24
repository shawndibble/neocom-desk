// The global sync queue: one Firebase session, so one pass at a time, with
// per-Character coalescing, foreground-over-background priority, a debounce
// for edits and a page-lifetime halt. What a pass *does* is injected
// (`runPass`), so this module knows nothing of Firestore and planSync.ts can
// own the pass without an import cycle.
import { isOnline } from '@/stores/network';
import { reportFailure } from '@/observability/reportFailure';
import { clearSyncScheduled, setStatus, setSyncScheduled } from './status';
import type { SyncedCollectionName } from './syncedCollections';

/**
 * Which collections a pass syncs: `'all'`, or only the named ones — what the
 * edits behind it touched (issue #4896). Every request without a set (boot,
 * the background sweep, reconnect, a Character switch, a flush) is `'all'`,
 * and `'all'` absorbs any set it is merged with.
 */
export type SyncScope = ReadonlySet<SyncedCollectionName> | 'all';

function unionScope(a: SyncScope | null, b: SyncScope): SyncScope {
  if (a === null) return b;
  if (a === 'all' || b === 'all') return 'all';
  return new Set([...a, ...b]);
}

function scopeOf(collections: readonly SyncedCollectionName[] | undefined): SyncScope {
  // No list, or an empty one, is a full pass: the safe reading of "unsure".
  return collections === undefined || collections.length === 0 ? 'all' : new Set(collections);
}

/**
 * How recent a full pass for a Character must be for a narrowed request to
 * stay narrowed; older than this and it runs as a full pass.
 *
 * A narrowed pass still pulls each collection it pushes, so last-write-wins
 * (merge.ts) always sees the remote copy of what it writes. What it skips is
 * pulling the *other* collections. Five minutes matches the background
 * sweep's gap for the active Character (`BACKGROUND_SYNC_MIN_GAP_MS`,
 * app/backgroundSync.ts, which gates on `lastFullSyncAt`): an untouched
 * collection is never staler than an idle open tab already lets it get. The
 * boot burst this exists for — boot pass, then the Overview's mining tax write
 * a few seconds later, then the rerun its mid-pass write earns — sits well
 * inside it.
 */
export const PARTIAL_PASS_WINDOW_MS = 5 * 60 * 1000;

/**
 * One Character's sync, from the moment it is requested until its promise
 * settles. It may run more than one pass: a request that arrives after a pass
 * has started (`started`) cannot be served by it — the pass may already have
 * read the local rows the request is about — so it sets `rerun` and the job
 * goes back in the queue once the pass ends, scoped to what those mid-pass
 * requests touched. Callers keep awaiting the one promise, so `flushSync`
 * (features/character/removeCharacter.ts) never deletes a Character's rows
 * before an edit made mid-pass has actually been pushed.
 */
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

export interface ScheduleSyncOptions {
  /**
   * The synced collections the edit wrote. Omit (or leave empty) when unsure
   * or when it is not an edit: that is a full pass, which is always safe.
   */
  collections?: readonly SyncedCollectionName[];
  debounceMs?: number;
  /** `background` is for the sweep only. */
  priority?: SyncPriority;
}

export interface SyncScheduler {
  /**
   * Debounced sync — call after each edit. A bare number is `debounceMs`.
   * Name the collections the edit touched so the pass can skip the rest.
   */
  scheduleSync: (characterId: number, options?: number | ScheduleSyncOptions) => void;
  /** Run a full sync now, serialized globally and coalesced per Character. */
  triggerSync: (characterId: number, priority?: SyncPriority) => Promise<void>;
  /** Stop syncing on this page until it reloads. Resolves once the sync in flight is done. */
  haltSync: () => Promise<void>;
  /** Undo `haltSync`. Tests only — the app reloads instead. */
  resetSyncHalt: () => void;
}

/**
 * `runCharacterPass` is one Character's sync over `scope`; it rejects on
 * failure. It may widen a narrowed scope itself (an ownerHash change wipes
 * every collection) and resolves with `'all'` when it did, so that pass counts
 * as the full pull it was.
 */
export function createSyncScheduler(
  runCharacterPass: (characterId: number, scope: SyncScope) => Promise<SyncScope | void>,
  { now = Date.now }: { now?: () => number } = {}
): SyncScheduler {
  const running = new Map<number, SyncJob>();
  const pendingTimers = new Map<
    number,
    { timer: ReturnType<typeof setTimeout>; priority: SyncPriority; scope: SyncScope }
  >();
  /**
   * When each Character's last successful full pass *started* — when its
   * reads happened. Page-lifetime on purpose: a fresh page has pulled nothing
   * yet, so its first pass is full whatever asked for it.
   */
  const lastFullPullAt = new Map<number, number>();

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

  /**
   * The scope a job actually runs with, decided when it starts rather than
   * when it was asked for — it may have waited behind a whole sweep.
   */
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
      const ran = (await runCharacterPass(characterId, scope)) ?? scope;
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
      reportFailure('sync', error);
      setStatus(characterId, {
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
        // A failure while the browser is offline is the network's, not the sync's.
        offline: !isOnline(),
      });
    } finally {
      busy = false;
      if (job.rerun !== null && !halted) {
        // Only what arrived mid-pass: the pass that just ran covered the rest.
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

  /**
   * Stop syncing on this page until it reloads: pending debounces are dropped,
   * new syncs are refused, queued ones are skipped, and this resolves once the
   * sync in flight (if any) is done.
   */
  async function haltSync(): Promise<void> {
    halted = true;
    // What follows a halt is a purge-then-wipe: no earlier pull vouches for it.
    lastFullPullAt.clear();
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
   * a foreground call for the same Character inside the debounce wins, and
   * the collections of every call inside it are unioned.
   */
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
    // Only an edit counts: the background sweep schedules every Character.
    setSyncScheduled(characterId, merged === 'foreground');
    pendingTimers.set(characterId, {
      priority: merged,
      scope,
      timer: setTimeout(() => {
        pendingTimers.delete(characterId);
        setSyncScheduled(characterId, false);
        requestSync(characterId, merged, scope).catch(() => {
          // Failure already surfaced via subscribeSyncStatus.
        });
      }, debounceMs),
    });
  }

  /** Run a full sync now — see `requestSync`. */
  function triggerSync(characterId: number, priority: SyncPriority = 'foreground'): Promise<void> {
    return requestSync(characterId, priority, 'all');
  }

  /**
   * Run a sync now, serialized globally. Coalesced per character: a queued sync
   * for it is awaited instead (promoted to foreground, and widened to this
   * scope), and one already running is awaited *through one more pass*, since
   * it may have read the local rows before whatever edit prompted this call.
   */
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
