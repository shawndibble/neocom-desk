import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTabElections,
  createTabLeader,
  runUnlessRunningElsewhere,
  type TabElections,
  type TabLeader,
} from './tabLeader';
import { createFakeLockManager, type FakeLockManager } from './fakeLockManager';

/** One simulated tab: its own document and window, sharing the origin's locks. */
function makeTab(locks: FakeLockManager | undefined, visibility: 'visible' | 'hidden' = 'visible') {
  const doc = Object.assign(new EventTarget(), {
    visibilityState: visibility as DocumentVisibilityState,
  });
  const win = new EventTarget();
  const leader = createTabLeader({ lockName: 'neocom:leader:test', locks, doc, win });
  started.push(leader);
  return {
    leader,
    show() {
      doc.visibilityState = 'visible';
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    hide() {
      doc.visibilityState = 'hidden';
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    pagehide() {
      win.dispatchEvent(new Event('pagehide'));
    },
    pageshow(persisted: boolean) {
      win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }));
    },
  };
}

const started: TabLeader[] = [];
const startedElections: TabElections[] = [];
afterEach(() => {
  started.splice(0).forEach((leader) => leader.stop());
  startedElections.splice(0).forEach((elections) => elections.stopAll());
});

/** A tab's per-job elections, sharing the origin's locks. */
function makeElections(locks: FakeLockManager) {
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  });
  const elections = createTabElections({ locks, doc, win: new EventTarget() });
  startedElections.push(elections);
  return elections;
}

/** Let the fake's queued grants and releases run. */
async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createTabLeader', () => {
  it('without Web Locks every tab leads, always — today’s behaviour', async () => {
    const a = makeTab(undefined);
    const b = makeTab(undefined, 'hidden');
    const listener = vi.fn();
    a.leader.subscribe(listener);
    await settle();
    a.hide();
    await settle();
    expect(a.leader.isLeader()).toBe(true);
    expect(b.leader.isLeader()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('elects exactly one of two visible tabs', async () => {
    const locks = createFakeLockManager();
    const a = makeTab(locks);
    await settle();
    const b = makeTab(locks);
    await settle();
    expect(a.leader.isLeader()).toBe(true);
    expect(b.leader.isLeader()).toBe(false);
  });

  it('hands leadership to the visible tab when the leader is hidden', async () => {
    const locks = createFakeLockManager();
    const a = makeTab(locks);
    await settle();
    const b = makeTab(locks);
    await settle();
    const onChange = vi.fn();
    b.leader.subscribe(onChange);

    a.hide();
    await settle();

    expect(a.leader.isLeader()).toBe(false);
    expect(b.leader.isLeader()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('a tab hidden while still queued never leads', async () => {
    const locks = createFakeLockManager();
    const a = makeTab(locks);
    await settle();
    const b = makeTab(locks);
    await settle();

    b.hide();
    a.hide();
    await settle();

    expect(a.leader.isLeader()).toBe(false);
    expect(b.leader.isLeader()).toBe(false);
    expect(locks.held()).toEqual([]);
  });

  it('with every tab hidden nobody leads, until one is shown', async () => {
    const locks = createFakeLockManager();
    const a = makeTab(locks, 'hidden');
    const b = makeTab(locks, 'hidden');
    await settle();
    expect(a.leader.isLeader()).toBe(false);
    expect(b.leader.isLeader()).toBe(false);

    b.show();
    await settle();
    expect(b.leader.isLeader()).toBe(true);
    expect(a.leader.isLeader()).toBe(false);
  });

  it('gives leadership up on pagehide and takes it back on a bfcache restore', async () => {
    const locks = createFakeLockManager();
    const a = makeTab(locks);
    await settle();
    const b = makeTab(locks);
    await settle();

    a.pagehide();
    await settle();
    expect(a.leader.isLeader()).toBe(false);
    expect(b.leader.isLeader()).toBe(true);

    b.hide();
    a.pageshow(true);
    await settle();
    expect(a.leader.isLeader()).toBe(true);
  });

  it('stop releases the lock for the next tab', async () => {
    const locks = createFakeLockManager();
    const a = makeTab(locks);
    await settle();
    const b = makeTab(locks);
    await settle();

    a.leader.stop();
    await settle();
    expect(a.leader.isLeader()).toBe(false);
    expect(b.leader.isLeader()).toBe(true);
  });
});

describe('createTabElections', () => {
  it('holds a job’s lock only while something in the tab stands for it', async () => {
    const locks = createFakeLockManager();
    const tab = makeElections(locks);
    const first = tab.join('poller', () => {});
    const second = tab.join('poller', () => {});
    await settle();
    expect(locks.held()).toEqual(['neocom:leader:poller']);

    first.leave();
    await settle();
    expect(locks.held()).toEqual(['neocom:leader:poller']);
    expect(second.isLeader()).toBe(true);

    second.leave();
    await settle();
    expect(locks.held()).toEqual([]);
    expect(second.isLeader()).toBe(false);
  });

  it('a tab without the poller mounted (a share route) never blocks another from polling', async () => {
    const locks = createFakeLockManager();
    const shareTab = makeElections(locks);
    const appTab = makeElections(locks);
    const shareSweep = shareTab.join('sweep', () => {});
    await settle();
    const appSweep = appTab.join('sweep', () => {});
    const appPoller = appTab.join('poller', () => {});
    await settle();

    expect(shareSweep.isLeader()).toBe(true);
    expect(appSweep.isLeader()).toBe(false);
    expect(appPoller.isLeader()).toBe(true);
  });

  it('hands a job over when its leader unmounts it', async () => {
    const locks = createFakeLockManager();
    const a = makeElections(locks);
    const b = makeElections(locks);
    const aPoller = a.join('poller', () => {});
    await settle();
    const onChange = vi.fn();
    const bPoller = b.join('poller', onChange);
    await settle();
    expect(bPoller.isLeader()).toBe(false);

    aPoller.leave();
    await settle();
    expect(bPoller.isLeader()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('runUnlessRunningElsewhere', () => {
  it('skips a run while another tab’s run holds the lock, and runs once it is free', async () => {
    const locks = createFakeLockManager();
    let finishFirst!: () => void;
    const first = runUnlessRunningElsewhere(
      'neocom:poll',
      () => new Promise<void>((resolve) => (finishFirst = resolve)),
      locks
    );
    await settle();
    const second = vi.fn(async () => {});
    await runUnlessRunningElsewhere('neocom:poll', second, locks);
    expect(second).not.toHaveBeenCalled();

    finishFirst();
    await first;
    await runUnlessRunningElsewhere('neocom:poll', second, locks);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('without Web Locks just runs', async () => {
    const task = vi.fn(async () => {});
    await runUnlessRunningElsewhere('neocom:poll', task, undefined);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
