/**
 * Tab Leader election (GLOSSARY.md): of every open tab of the app, the one that
 * runs a piece of origin-wide background work — the Foreground Poller, the
 * background sync sweep — so several open tabs do it once, not once each.
 *
 * One election per job (`neocom:leader:<job>`), each joined only by the tabs
 * whose component for that job is mounted: the sweep lives in `App` (every
 * route) but the poller only in `Layout`, so a tab on `/s/*` or `/share/*` or `/login`
 * must never win the poller's lock and then not poll.
 *
 * Leadership is a held Web Lock. For the sweep only a *visible* tab holds it:
 * the sweep skips while hidden, so a hidden leader would mean nobody works. A
 * tab requests the lock when it becomes visible and gives it up (or drops its
 * queued request) when hidden, on `pagehide`, when the job unmounts, or when
 * closed — the browser releases a closed tab's locks. With every tab hidden
 * nobody leads, which is exactly the pre-election hidden behaviour.
 *
 * The poller's leader keeps its lock while hidden (`keepWhileHidden`, issue
 * #5120), so a player who switches away for a few minutes still gets device
 * pop-ups. A hidden tab may lead if nobody else does; a tab being shown steals
 * the lock, so a visible tab always wins over a hidden — perhaps frozen — one,
 * and a displaced leader queues up again to take over once that tab goes.
 *
 * Without Web Locks every tab is leader, permanently, and no change is ever
 * announced — so callers behave exactly as they did before election existed.
 *
 * Kept import-free: it sits on the boot path (`Layout`, `App`).
 * See docs/context/decisions/20260928-165056-multi-tab-leadership-one-visible-tab-runs-background.md.
 */

/** The slice of `LockManager` this uses — so a test can hand in a fake. */
interface LocksLike {
  request(
    name: string,
    options: { signal?: AbortSignal; ifAvailable?: boolean; steal?: boolean },
    callback: (lock: unknown) => unknown
  ): Promise<unknown>;
}

interface DocLike extends EventTarget {
  readonly visibilityState: DocumentVisibilityState;
}

export interface TabLeader {
  isLeader(): boolean;
  /** Called on every change of this tab's leadership. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Give leadership up for good and stop listening. */
  stop(): void;
}

export function createTabLeader(env: {
  /** The Web Lock that is leadership, e.g. `neocom:leader:poller`. */
  lockName: string;
  locks: LocksLike | undefined;
  doc: DocLike;
  win: EventTarget;
  /** Keep leading while hidden, yielding only to a tab being shown. */
  keepWhileHidden?: boolean;
}): TabLeader {
  const { lockName, locks, doc, win, keepWhileHidden = false } = env;
  if (!locks) {
    return { isLeader: () => true, subscribe: () => () => {}, stop: () => {} };
  }

  const listeners = new Set<() => void>();
  let leader = false;
  let stopped = false;
  /** Present while a request is queued or the lock is held. */
  let pending: AbortController | null = null;
  /** Present while the lock is held: resolving it releases the lock. */
  let release: (() => void) | null = null;
  /** The request whose lock is held — told apart from a later queued one. */
  let holder: AbortController | null = null;

  function setLeader(next: boolean) {
    if (leader === next) return;
    leader = next;
    listeners.forEach((listener) => listener());
  }

  /** `steal` only on being shown: a tab displaced by one just queues again. */
  function acquire(steal = false) {
    const visible = doc.visibilityState === 'visible';
    if (stopped || holder || (!visible && !keepWhileHidden)) return;
    if (pending) {
      if (!(steal && keepWhileHidden && visible)) return;
      // Queued behind a hidden leader: take it now instead.
      const queued = pending;
      pending = null;
      queued.abort();
    }
    const controller = new AbortController();
    pending = controller;
    // A steal is granted at once, and Web Locks refuse a signal alongside it.
    const options =
      steal && keepWhileHidden && visible ? { steal: true } : { signal: controller.signal };
    locks!
      .request(lockName, options, () => {
        // Granted after this tab gave up on it: let the next tab have it.
        if (pending !== controller) return;
        if (!keepWhileHidden && doc.visibilityState !== 'visible') return;
        return new Promise<void>((resolve) => {
          holder = controller;
          release = resolve;
          setLeader(true);
        });
      })
      .catch(() => {
        // AbortError: dropped while queued, or stolen by a tab being shown.
        if (holder !== controller) return;
        holder = null;
        release = null;
        pending = null;
        setLeader(false);
        acquire();
      })
      .finally(() => {
        if (pending === controller && holder !== controller) pending = null;
      });
  }

  function relinquish() {
    const controller = pending;
    pending = null;
    holder = null;
    controller?.abort();
    const held = release;
    release = null;
    setLeader(false);
    held?.();
  }

  function onVisibilityChange() {
    if (doc.visibilityState === 'visible') acquire(true);
    else if (!keepWhileHidden) relinquish();
  }

  function onPageShow(event: Event) {
    if ((event as PageTransitionEvent).persisted) onVisibilityChange();
  }

  doc.addEventListener('visibilitychange', onVisibilityChange);
  win.addEventListener('pagehide', relinquish);
  win.addEventListener('pageshow', onPageShow);
  acquire(true);

  return {
    isLeader: () => leader,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      stopped = true;
      doc.removeEventListener('visibilitychange', onVisibilityChange);
      win.removeEventListener('pagehide', relinquish);
      win.removeEventListener('pageshow', onPageShow);
      relinquish();
      listeners.clear();
    },
  };
}

export type TabJob = 'poller' | 'sweep';

export interface TabElectionEnv {
  locks: LocksLike | undefined;
  doc: DocLike;
  win: EventTarget;
}

export interface TabElectionSeat {
  /** Should this tab run the job right now? */
  isLeader(): boolean;
  /** Stop standing; the job's last seat to leave gives its lock up. */
  leave(): void;
}

export interface TabElections {
  /** Stand for `job`'s leadership; `onChange` hears every gain or loss. */
  join(job: TabJob, onChange: () => void): TabElectionSeat;
  /** End every election (HMR, tests). */
  stopAll(): void;
}

/**
 * One election per job, started by its first seat and ended by its last, so a
 * tab stands only while something in it would do the work.
 */
export function createTabElections(env: TabElectionEnv): TabElections {
  const elections = new Map<TabJob, { leader: TabLeader; seats: number }>();

  return {
    join(job, onChange) {
      let election = elections.get(job);
      if (!election) {
        election = {
          leader: createTabLeader({
            ...env,
            lockName: `neocom:leader:${job}`,
            keepWhileHidden: job === 'poller',
          }),
          seats: 0,
        };
        elections.set(job, election);
      }
      const current = election;
      current.seats += 1;
      const unsubscribe = current.leader.subscribe(onChange);
      let left = false;
      return {
        isLeader: () => !left && current.leader.isLeader(),
        leave() {
          if (left) return;
          left = true;
          unsubscribe();
          current.seats -= 1;
          if (current.seats === 0 && elections.get(job) === current) {
            elections.delete(job);
            current.leader.stop();
          }
        },
      };
    },
    stopAll() {
      elections.forEach(({ leader }) => leader.stop());
      elections.clear();
    },
  };
}

/**
 * Run `task` unless another tab is already running one under `lockName` — then
 * skip it, since that run covers this one. Without Web Locks, just run it.
 */
export async function runUnlessRunningElsewhere(
  lockName: string,
  task: () => Promise<void>,
  locks: LocksLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks
): Promise<void> {
  if (!locks) return task();
  await locks.request(lockName, { ifAvailable: true }, (lock) => (lock ? task() : undefined));
}

let appElections: TabElections | null = null;

/** Stand for `job` in this tab's elections, created on first use. */
export function joinTabElection(job: TabJob, onChange: () => void): TabElectionSeat {
  appElections ??= createTabElections({
    locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
    doc: document,
    win: window,
  });
  return appElections.join(job, onChange);
}

// A hot-replaced module would otherwise leave its predecessor holding the locks.
import.meta.hot?.dispose(() => {
  appElections?.stopAll();
  appElections = null;
});
