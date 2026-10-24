// The scheduler's collection-scope rules (issue #4896), against a stub pass:
// which requests merge into one pass, what that pass is told to sync, and when
// a narrowed request is widened back to a full pass.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSyncStatus } from './status';
import {
  PARTIAL_PASS_WINDOW_MS,
  createSyncScheduler,
  type SyncScheduler,
  type SyncScope,
} from './syncScheduler';
import type { SyncedCollectionName } from './syncedCollections';

vi.mock('@/observability/reportFailure', () => ({ reportFailure: vi.fn() }));

/** What each pass was asked to sync, as sorted names or 'all'. */
type Seen = (readonly SyncedCollectionName[] | 'all')[];

function describeScope(scope: SyncScope): readonly SyncedCollectionName[] | 'all' {
  return scope === 'all' ? 'all' : [...scope].sort();
}

let clock = 0;
let seen: Seen;
let gate: Promise<void> | null;
let scheduler: SyncScheduler;

function create(
  pass: (characterId: number, scope: SyncScope) => Promise<SyncScope | void> = async () => {}
): SyncScheduler {
  return createSyncScheduler(
    async (characterId, scope) => {
      seen.push(describeScope(scope));
      if (gate) await gate;
      return pass(characterId, scope);
    },
    { now: () => clock }
  );
}

/** Hold the next pass open until `release` is called. */
function holdPasses(): () => void {
  let release!: () => void;
  gate = new Promise<void>((resolve) => {
    release = () => {
      gate = null;
      resolve();
    };
  });
  return release;
}

beforeEach(() => {
  clock = 1_000_000;
  seen = [];
  gate = null;
  scheduler = create();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

/** A full pass that completed at `clock`, so a narrowed one may follow. */
async function fullPass(characterId = 1): Promise<void> {
  await scheduler.triggerSync(characterId);
  seen = [];
}

/** Let one debounced request fire and its pass (or passes) settle. */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(50);
}

describe('collection-scoped scheduling', () => {
  it('runs a narrowed pass shortly after a full one', async () => {
    await fullPass();
    scheduler.scheduleSync(1, { collections: ['miningTaxAssignments'], debounceMs: 10 });
    await flush();
    expect(seen).toEqual([['miningTaxAssignments']]);
  });

  it('unions the collections of requests coalesced into one debounce', async () => {
    await fullPass();
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    scheduler.scheduleSync(1, { collections: ['miningTaxAssignments', 'payees'], debounceMs: 10 });
    scheduler.scheduleSync(1, { collections: ['settings'], debounceMs: 10 });
    await flush();
    expect(seen).toEqual([['miningTaxAssignments', 'payees', 'settings']]);
  });

  it.each([
    ['before', 'first'],
    ['after', 'last'],
  ] as const)('lets a request with no collections win (full request %s)', async (_label, order) => {
    await fullPass();
    if (order === 'first') scheduler.scheduleSync(1, 10);
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    if (order === 'last') scheduler.scheduleSync(1, 10);
    await flush();
    expect(seen).toEqual(['all']);
  });

  it('treats an empty collection list as a full pass', async () => {
    await fullPass();
    scheduler.scheduleSync(1, { collections: [], debounceMs: 10 });
    await flush();
    expect(seen).toEqual(['all']);
  });

  it('runs a full pass for a narrowed request when no full pass ran this session', async () => {
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await flush();
    expect(seen).toEqual(['all']);
  });

  it('widens a narrowed request to a full pass once the last full pull is too old', async () => {
    await fullPass();
    clock += PARTIAL_PASS_WINDOW_MS + 1;
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await flush();
    expect(seen).toEqual(['all']);
  });

  it('keeps narrowing right up to the edge of the window', async () => {
    await fullPass();
    clock += PARTIAL_PASS_WINDOW_MS;
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await flush();
    expect(seen).toEqual([['payees']]);
  });

  it('measures the window from the start of the full pass, not its end', async () => {
    const release = holdPasses();
    const full = scheduler.triggerSync(1);
    await vi.advanceTimersByTimeAsync(0);
    clock += PARTIAL_PASS_WINDOW_MS; // the full pass took the whole window
    release();
    await full;
    seen = [];
    clock += 1;
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await flush();
    expect(seen).toEqual(['all']);
  });

  it('does not count a failed full pass as a recent full pull', async () => {
    let fail = true;
    scheduler = create(async () => {
      if (fail) throw new Error('offline');
    });
    await scheduler.triggerSync(1).catch(() => {});
    fail = false;
    seen = [];
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await flush();
    expect(seen).toEqual(['all']);
  });

  it.each([
    ['full', 'all'],
    ['narrowed', 'narrowed'],
  ] as const)(
    'runs full after a failed %s pass, even inside the window of an earlier full one',
    async (_label, failing) => {
      let fail = false;
      scheduler = create(async () => {
        if (fail) throw new Error('offline');
      });
      await fullPass();
      fail = true;
      if (failing === 'all') await scheduler.triggerSync(1).catch(() => {});
      else {
        scheduler.scheduleSync(1, { collections: ['plans'], debounceMs: 10 });
        await flush();
      }
      fail = false;
      seen = [];
      scheduler.scheduleSync(1, { collections: ['quickbars'], debounceMs: 10 });
      await flush();
      expect(seen).toEqual(['all']);
    }
  );

  it('does not let a narrowed pass extend the window', async () => {
    await fullPass();
    clock += PARTIAL_PASS_WINDOW_MS - 10;
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await flush();
    clock += 20;
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await flush();
    expect(seen).toEqual([['payees'], 'all']);
  });

  it('records a pass the driver widened itself as a full pull', async () => {
    let widen = true;
    scheduler = create(async (_id, scope) => (widen && scope !== 'all' ? 'all' : undefined));
    // No full pass yet, so this one runs full anyway; then a narrowed one the
    // driver widens (an ownerHash change) — and that counts as full too.
    await scheduler.triggerSync(1);
    clock += PARTIAL_PASS_WINDOW_MS - 1;
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await flush();
    widen = false;
    clock += 2; // past the first full pass's window, inside the widened one's
    seen = [];
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await flush();
    expect(seen).toEqual([['payees']]);
  });

  it('keeps recency per Character', async () => {
    await fullPass(1);
    scheduler.scheduleSync(2, { collections: ['payees'], debounceMs: 10 });
    await flush();
    expect(seen).toEqual(['all']);
  });

  it('unions the collections of requests coalesced into a queued pass', async () => {
    await fullPass(1);
    const release = holdPasses();
    const blocker = scheduler.triggerSync(2);
    await vi.advanceTimersByTimeAsync(0);
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    scheduler.scheduleSync(1, { collections: ['fittings'], debounceMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    release();
    await blocker;
    await flush();
    expect(seen).toEqual(['all', ['fittings', 'payees']]);
  });

  it('lets a full request win over a queued narrowed one', async () => {
    await fullPass(1);
    const release = holdPasses();
    const blocker = scheduler.triggerSync(2);
    await vi.advanceTimersByTimeAsync(0);
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    const full = scheduler.triggerSync(1);
    release();
    await Promise.all([blocker, full]);
    expect(seen).toEqual(['all', 'all']);
  });
});

describe('the one-more-pass rerun', () => {
  it('reruns only what the mid-pass writes touched', async () => {
    const release = holdPasses();
    const first = scheduler.triggerSync(1);
    await vi.advanceTimersByTimeAsync(0);
    scheduler.scheduleSync(1, { collections: ['miningTaxAssignments'], debounceMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    release();
    await first;
    expect(seen).toEqual(['all', ['miningTaxAssignments', 'payees']]);
  });

  it('reruns a full pass when any mid-pass request is full', async () => {
    await fullPass();
    const release = holdPasses();
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    scheduler.scheduleSync(1, { collections: ['fittings'], debounceMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    const flushed = scheduler.triggerSync(1);
    release();
    await flushed;
    expect(seen).toEqual([['payees'], 'all']);
  });

  it('holds the caller through the narrowed rerun', async () => {
    const release = holdPasses();
    const first = scheduler.triggerSync(1);
    await vi.advanceTimersByTimeAsync(0);
    scheduler.scheduleSync(1, { collections: ['payees'], debounceMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    release();
    await first;
    expect(seen).toHaveLength(2);
  });
});

describe('sync status', () => {
  it('stamps lastFullSyncAt only on a full pass, lastSyncedAt on every pass', async () => {
    await fullPass(9);
    const full = getSyncStatus(9);
    expect(full.lastFullSyncAt).toBe(clock);
    expect(full.lastSyncedAt).toBe(clock);

    clock += 1000;
    scheduler.scheduleSync(9, { collections: ['payees'], debounceMs: 10 });
    await flush();
    const narrowed = getSyncStatus(9);
    expect(narrowed.state).toBe('idle');
    expect(narrowed.lastSyncedAt).toBe(clock);
    expect(narrowed.lastFullSyncAt).toBe(clock - 1000);
  });
});
