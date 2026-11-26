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
  subscribe(listener: () => void): () => void;
  stop(): void;
}

export function createTabLeader(env: {
  lockName: string;
  locks: LocksLike | undefined;
  doc: DocLike;
  win: EventTarget;
  keepWhileHidden?: boolean;
}): TabLeader {
  const { lockName, locks, doc, win, keepWhileHidden = false } = env;
  if (!locks) {
    return { isLeader: () => true, subscribe: () => () => {}, stop: () => {} };
  }

  const listeners = new Set<() => void>();
  let leader = false;
  let stopped = false;
  let current: { controller: AbortController; kind: RequestKind } | null = null;
  let release: (() => void) | null = null;

  function setLeader(next: boolean) {
    if (leader === next) return;
    leader = next;
    listeners.forEach((listener) => listener());
  }

  const isVisible = () => doc.visibilityState === 'visible';

  function request(kind: RequestKind) {
    const controller = new AbortController();
    const mine = { controller, kind };
    current = mine;
    const options =
      kind === 'steal'
        ? { steal: true }
        : kind === 'try'
          ? { ifAvailable: true }
          : { signal: controller.signal };
    locks!
      .request(lockName, options, (lock) => {
        if (current !== mine || !lock) return;
        if (!keepWhileHidden && !isVisible()) return;
        return new Promise<void>((resolve) => {
          release = resolve;
          setLeader(true);
        });
      })
      .catch(() => {
        if (current !== mine) return;
        current = null;
        release = null;
        setLeader(false);
        stand();
      })
      .finally(() => {
        if (current === mine && !release) current = null;
      });
  }

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
      if (current?.kind === 'queue') relinquish();
      return stand();
    }
    if (!(await visibleTabWaiting()) || isVisible() || !release) return;
    relinquish();
    stand();
  }

  async function visibleTabWaiting(): Promise<boolean> {
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
  isLeader(): boolean;
  leave(): void;
}

export interface TabElections {
  join(job: TabJob, onChange: () => void): TabElectionSeat;
  stopAll(): void;
}

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

export async function runUnlessRunningElsewhere(
  lockName: string,
  task: () => Promise<void>,
  locks: LocksLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks
): Promise<void> {
  if (!locks) return task();
  await locks.request(lockName, { ifAvailable: true }, (lock) => (lock ? task() : undefined));
}

let appElections: TabElections | null = null;

export function joinTabElection(job: TabJob, onChange: () => void): TabElectionSeat {
  appElections ??= createTabElections({
    locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
    doc: document,
    win: window,
  });
  return appElections.join(job, onChange);
}

import.meta.hot?.dispose(() => {
  appElections?.stopAll();
  appElections = null;
});
