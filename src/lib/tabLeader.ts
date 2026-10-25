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
 * pop-ups. Only visible tabs queue for the lock. A tab being shown steals it,
 * so a visible tab wins over a hidden — perhaps frozen — one; a leader going
 * hidden hands it to a waiting visible tab and otherwise keeps it; a hidden tab
 * takes it only when nobody holds it.
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
  query?(): Promise<{ pending?: { name?: string }[] }>;
}

type RequestKind = 'queue' | 'steal' | 'try';

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
  /** This tab's live request: queued, in flight, or holding the lock. */
  let current: { controller: AbortController; kind: RequestKind } | null = null;
  /** Present while the lock is held: resolving it releases the lock. */
  let release: (() => void) | null = null;

  function setLeader(next: boolean) {
    if (leader === next) return;
    leader = next;
    listeners.forEach((listener) => listener());
  }

  const isVisible = () => doc.visibilityState === 'visible';

  /**
   * `queue` waits its turn; `steal` takes the lock at once (a tab being shown,
   * `keepWhileHidden` only); `try` takes it only if nobody holds it — the only
   * way a hidden tab stands, so the queue holds visible tabs alone.
   */
  function request(kind: RequestKind) {
    const controller = new AbortController();
    const mine = { controller, kind };
    current = mine;
    // Web Locks refuse a signal alongside `steal` or `ifAvailable`.
    const options =
      kind === 'steal'
        ? { steal: true }
        : kind === 'try'
          ? { ifAvailable: true }
          : { signal: controller.signal };
    locks!
      .request(lockName, options, (lock) => {
        // Taken, or granted after this tab gave up on it: let the next tab have it.
        if (current !== mine || !lock) return;
        if (!keepWhileHidden && !isVisible()) return;
        return new Promise<void>((resolve) => {
          release = resolve;
          setLeader(true);
        });
      })
      .catch(() => {
        // AbortError: dropped while queued, or stolen by a tab being shown —
        // possibly before its callback ran. Either way, stand again.
        if (current !== mine) return;
        current = null;
        release = null;
        setLeader(false);
        stand();
      })
      .finally(() => {
        // An `ifAvailable` that found the lock taken.
        if (current === mine && !release) current = null;
      });
  }

  /** Join the election without displacing anyone. */
  function stand() {
    if (stopped || current) return;
    if (isVisible()) request('queue');
    else if (keepWhileHidden) request('try');
  }

  function relinquish() {
    const mine = current;
    current = null;
    mine?.controller.abort();
    const held = release;
    release = null;
    setLeader(false);
    held?.();
  }

  function onShown() {
    if (!keepWhileHidden) return stand();
    if (release || current?.kind === 'steal') return;
    relinquish();
    request('steal');
  }

  async function onHidden() {
    if (!keepWhileHidden) return relinquish();
    if (!release) {
      // A hidden tab never waits in the queue.
      if (current?.kind === 'queue') relinquish();
      return stand();
    }
    // Keep leading unless a visible tab is waiting: hand it over then.
    if (!(await visibleTabWaiting()) || isVisible() || !release) return;
    relinquish();
    stand();
  }

  async function visibleTabWaiting(): Promise<boolean> {
    // Only visible tabs queue, so any waiter is one. Without `query`, assume one.
    if (!locks!.query) return true;
    const { pending = [] } = await locks!.query().catch(() => ({ pending: undefined }));
    return pending.some((entry) => entry.name === lockName);
  }

  function onVisibilityChange() {
    if (isVisible()) onShown();
    else void onHidden();
  }

  function onPageShow(event: Event) {
    if ((event as PageTransitionEvent).persisted) onVisibilityChange();
  }

  doc.addEventListener('visibilitychange', onVisibilityChange);
  win.addEventListener('pagehide', relinquish);
  win.addEventListener('pageshow', onPageShow);
  if (isVisible()) onShown();
  else stand();

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
