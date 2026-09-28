/**
 * Tab Leader election (CONTEXT.md): of every open tab of the app, the one that
 * runs the origin-wide background work — the Foreground Poller and the
 * background sync sweep — so N tabs don't do it N times.
 *
 * Leadership is a held Web Lock (`neocom:leader`), and only a *visible* tab
 * holds it: both jobs skip while hidden, so a hidden leader would mean nobody
 * works. A tab requests the lock when it becomes visible and gives it up (or
 * drops its queued request) when hidden, on `pagehide`, or when closed — the
 * browser releases a closed tab's locks. With every tab hidden nobody leads,
 * which is exactly today's hidden behaviour.
 *
 * Without Web Locks every tab is leader, permanently, and no change is ever
 * announced — so callers behave exactly as they did before election existed.
 *
 * Kept import-free: it sits on the boot path (`Layout`, `App`).
 * See docs/context/decisions/20260928-165056-multi-tab-leadership-one-visible-tab-runs-background.md.
 */

const LEADER_LOCK = 'neocom:leader';

/** The slice of `LockManager` this uses — so a test can hand in a fake. */
interface LocksLike {
  request(
    name: string,
    options: { signal?: AbortSignal },
    callback: () => unknown
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
  locks: LocksLike | undefined;
  doc: DocLike;
  win: EventTarget;
}): TabLeader {
  const { locks, doc, win } = env;
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

  function setLeader(next: boolean) {
    if (leader === next) return;
    leader = next;
    listeners.forEach((listener) => listener());
  }

  function acquire() {
    if (stopped || pending || doc.visibilityState !== 'visible') return;
    const controller = new AbortController();
    pending = controller;
    locks!
      .request(LEADER_LOCK, { signal: controller.signal }, () => {
        // Granted after this tab gave up on it: let the next tab have it.
        if (pending !== controller || doc.visibilityState !== 'visible') return;
        return new Promise<void>((resolve) => {
          release = resolve;
          setLeader(true);
        });
      })
      .catch(() => {
        // AbortError from a request dropped while queued — nothing to undo.
      })
      .finally(() => {
        if (pending === controller) pending = null;
      });
  }

  function relinquish() {
    const controller = pending;
    pending = null;
    controller?.abort();
    const held = release;
    release = null;
    setLeader(false);
    held?.();
  }

  function onVisibilityChange() {
    if (doc.visibilityState === 'visible') acquire();
    else relinquish();
  }

  function onPageShow(event: Event) {
    if ((event as PageTransitionEvent).persisted) onVisibilityChange();
  }

  doc.addEventListener('visibilitychange', onVisibilityChange);
  win.addEventListener('pagehide', relinquish);
  win.addEventListener('pageshow', onPageShow);
  acquire();

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

let appLeader: TabLeader | null = null;

/** This tab's election, started on first use. */
function tabLeader(): TabLeader {
  appLeader ??= createTabLeader({
    locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
    doc: document,
    win: window,
  });
  return appLeader;
}

/** Should this tab run origin-wide background work right now? */
export function isTabLeader(): boolean {
  return tabLeader().isLeader();
}

/** Subscribe to this tab gaining or losing leadership. Returns the unsubscribe. */
export function onTabLeaderChange(listener: () => void): () => void {
  return tabLeader().subscribe(listener);
}
