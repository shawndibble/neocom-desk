import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTabLeader, type TabLeader } from './tabLeader';
import { createFakeLockManager, type FakeLockManager } from './fakeLockManager';

/** One simulated tab: its own document and window, sharing the origin's locks. */
function makeTab(locks: FakeLockManager | undefined, visibility: 'visible' | 'hidden' = 'visible') {
  const doc = Object.assign(new EventTarget(), {
    visibilityState: visibility as DocumentVisibilityState,
  });
  const win = new EventTarget();
  const leader = createTabLeader({ locks, doc, win });
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
afterEach(() => {
  started.splice(0).forEach((leader) => leader.stop());
});

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
