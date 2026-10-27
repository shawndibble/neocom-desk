import { describe, it, expect } from 'vitest';
import {
  ESI_FANOUT_CONCURRENCY,
  mapWithConcurrencyLimit,
  createSemaphore,
  type PriorityTicket,
} from './concurrency';

/** Runs `fn` over 0..n-1, recording the highest number of overlapping calls. */
async function runTracking(count: number, limit: number) {
  const order: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  await mapWithConcurrencyLimit(
    Array.from({ length: count }, (_, i) => i),
    limit,
    async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      order.push(item);
      inFlight -= 1;
    }
  );
  return { order, maxInFlight };
}

describe('mapWithConcurrencyLimit', () => {
  it('never exceeds the limit', async () => {
    const { maxInFlight } = await runTracking(50, 10);
    expect(maxInFlight).toBe(10);
  });

  it('visits every item exactly once', async () => {
    const { order } = await runTracking(50, 10);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it('spawns no more workers than there are items', async () => {
    const { maxInFlight } = await runTracking(3, 10);
    expect(maxInFlight).toBe(3);
  });

  it('resolves on an empty list without calling fn', async () => {
    let calls = 0;
    await mapWithConcurrencyLimit([], 10, async () => {
      calls += 1;
    });
    expect(calls).toBe(0);
  });

  it('rejects if any call rejects, rather than swallowing it', async () => {
    // Callers that want per-item isolation wrap fn themselves (roster.ts does).
    await expect(
      mapWithConcurrencyLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });

  it('caps the ESI fan-out at 10', () => {
    expect(ESI_FANOUT_CONCURRENCY).toBe(10);
  });
});

describe('createSemaphore', () => {
  it('hands out up to `limit` permits without waiting', async () => {
    const semaphore = createSemaphore(2);
    const first = await semaphore.acquire();
    const second = await semaphore.acquire();
    expect(semaphore.inFlight).toBe(2);
    first();
    second();
    expect(semaphore.inFlight).toBe(0);
  });

  it('makes the next caller wait until a permit is released', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    let admitted = false;
    const queued = semaphore.acquire().then((release) => {
      admitted = true;
      return release;
    });

    await Promise.resolve();
    expect(admitted).toBe(false);
    held();
    (await queued)();
    expect(admitted).toBe(true);
  });

  it('is FIFO, so a fan-out cannot starve a single queued caller', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const order: number[] = [];
    const waiters = [1, 2, 3].map((n) =>
      semaphore.acquire().then((release) => {
        order.push(n);
        release();
      })
    );

    held();
    await Promise.all(waiters);
    expect(order).toEqual([1, 2, 3]);
  });

  it('releasing twice frees only one permit', async () => {
    const semaphore = createSemaphore(1);
    const release = await semaphore.acquire();
    release();
    release();
    expect(semaphore.inFlight).toBe(0);
    const again = await semaphore.acquire();
    expect(semaphore.inFlight).toBe(1);
    again();
  });

  it('rejects a queued caller whose signal aborts, without consuming a permit', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const controller = new AbortController();
    const queued = semaphore.acquire(controller.signal);

    controller.abort();
    await expect(queued).rejects.toThrow();

    held();
    // The abandoned waiter must not still be holding the freed permit.
    expect(semaphore.inFlight).toBe(0);
    const next = await semaphore.acquire();
    next();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const semaphore = createSemaphore(1);
    await expect(semaphore.acquire(AbortSignal.abort())).rejects.toThrow();
    expect(semaphore.inFlight).toBe(0);
  });
});

describe('createSemaphore priority lanes', () => {
  const low = (): PriorityTicket => ({ priority: 'low' });

  /** Lets every already-settled admission run its `then`. */
  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };

  /** Queues acquires and records, by label, the order they are admitted in (permits kept). */
  function recorder() {
    const order: string[] = [];
    const track = (label: string, pending: Promise<() => void>) =>
      pending.then(() => {
        order.push(label);
      });
    return { order, track };
  }

  /** Queues acquires that give their permit straight back, recording admission order. */
  function passer(semaphore: ReturnType<typeof createSemaphore>) {
    const order: string[] = [];
    const queue = (label: string, ticket?: PriorityTicket) =>
      semaphore.acquire(undefined, ticket).then((release) => {
        order.push(label);
        release();
      });
    return { order, queue };
  }

  it('admits a foreground waiter before background waiters queued ahead of it', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire(undefined, low());
    const { order, track } = recorder();
    void track('bg1', semaphore.acquire(undefined, low()));
    void track('bg2', semaphore.acquire(undefined, low()));
    void track('fg', semaphore.acquire());

    held();
    await flush();
    expect(order).toEqual(['fg']);
  });

  it('keeps FIFO order within each lane', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const { order, queue } = passer(semaphore);
    const waits = [
      queue('bg1', low()),
      queue('fg1'),
      queue('bg2', low()),
      queue('fg2'),
      queue('bg3', low()),
    ];

    held();
    await Promise.all(waits);
    expect(order).toEqual(['fg1', 'fg2', 'bg1', 'bg2', 'bg3']);
  });

  it('never lets background hold more than `limit - lowReserve` permits', async () => {
    const semaphore = createSemaphore(4, { lowReserve: 2 });
    await semaphore.acquire(undefined, low());
    await semaphore.acquire(undefined, low());
    const { order, track } = recorder();
    void track('bg3', semaphore.acquire(undefined, low()));

    await flush();
    expect(order).toEqual([]);
    expect(semaphore.inFlight).toBe(2);
    // The reserve is still there for foreground, at once.
    await semaphore.acquire();
    await semaphore.acquire();
    expect(semaphore.inFlight).toBe(4);
  });

  it('lets background use every non-reserved permit when nothing else wants one', async () => {
    const semaphore = createSemaphore(12, { lowReserve: 4 });
    for (let i = 0; i < 8; i += 1) await semaphore.acquire(undefined, low());
    expect(semaphore.inFlight).toBe(8);
  });

  it('admits a queued background waiter once a background permit frees under the cap', async () => {
    const semaphore = createSemaphore(4, { lowReserve: 2 });
    const first = await semaphore.acquire(undefined, low());
    await semaphore.acquire(undefined, low());
    const { order, track } = recorder();
    void track('bg3', semaphore.acquire(undefined, low()));

    first();
    await flush();
    expect(order).toEqual(['bg3']);
    expect(semaphore.inFlight).toBe(2);
  });

  it('hands a released background permit to a queued foreground waiter first', async () => {
    const semaphore = createSemaphore(2, { lowReserve: 1 });
    const bg = await semaphore.acquire(undefined, low());
    await semaphore.acquire();
    const { order, track } = recorder();
    void track('bg', semaphore.acquire(undefined, low()));
    void track('fg', semaphore.acquire());

    bg();
    await flush();
    expect(order).toEqual(['fg']);
  });

  it('promotes a queued background waiter into the foreground lane, in arrival order', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const promoted = low();
    const { order, queue } = passer(semaphore);
    const waits = [queue('bgA', low()), queue('bgB', promoted), queue('fgC')];

    semaphore.promote(promoted);
    expect(promoted.priority).toBe('normal');
    held();
    await Promise.all(waits);
    expect(order).toEqual(['bgB', 'fgC', 'bgA']);
  });

  it('promotion lifts a background waiter held back only by the reserve', async () => {
    const semaphore = createSemaphore(2, { lowReserve: 1 });
    await semaphore.acquire(undefined, low());
    const ticket = low();
    const { order, track } = recorder();
    void track('bg', semaphore.acquire(undefined, ticket));
    await flush();
    expect(order).toEqual([]);

    semaphore.promote(ticket);
    await flush();
    expect(order).toEqual(['bg']);
  });

  it('queues a later acquire on a promoted ticket in the foreground lane', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const ticket = low();
    semaphore.promote(ticket);
    const { order, track } = recorder();
    void track('bg', semaphore.acquire(undefined, low()));
    void track('later', semaphore.acquire(undefined, ticket));

    held();
    await flush();
    expect(order).toEqual(['later']);
  });

  it('releases a permit promoted while held against the lane it was admitted in', async () => {
    const semaphore = createSemaphore(2, { lowReserve: 1 });
    const ticket = low();
    const release = await semaphore.acquire(undefined, ticket);
    semaphore.promote(ticket);
    release();

    // Background's count is back to zero, so its one permit is free again.
    const { order, track } = recorder();
    void track('bg', semaphore.acquire(undefined, low()));
    await flush();
    expect(order).toEqual(['bg']);
  });

  it('frees an aborted background waiter’s place in the queue', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const controller = new AbortController();
    const abandoned = semaphore.acquire(controller.signal, low());
    const { order, track } = recorder();
    const next = track('bg', semaphore.acquire(undefined, low()));

    controller.abort();
    await expect(abandoned).rejects.toThrow();
    held();
    await next;
    expect(order).toEqual(['bg']);
    expect(semaphore.inFlight).toBe(1);
  });

  it('frees an aborted foreground waiter’s place in the queue', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const controller = new AbortController();
    const abandoned = semaphore.acquire(controller.signal);
    const { order, track } = recorder();
    const next = track('bg', semaphore.acquire(undefined, low()));

    controller.abort();
    await expect(abandoned).rejects.toThrow();
    held();
    await next;
    expect(order).toEqual(['bg']);
    expect(semaphore.inFlight).toBe(1);
  });

  it('removes a waiter aborted after promotion from the foreground lane', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const controller = new AbortController();
    const ticket = low();
    const abandoned = semaphore.acquire(controller.signal, ticket);
    semaphore.promote(ticket);
    const { order, track } = recorder();
    const next = track('fg', semaphore.acquire());

    controller.abort();
    await expect(abandoned).rejects.toThrow();
    held();
    await next;
    expect(order).toEqual(['fg']);
    expect(semaphore.inFlight).toBe(1);
  });
});

describe('createSemaphore high lane', () => {
  const low = (): PriorityTicket => ({ priority: 'low' });
  const high = (): PriorityTicket => ({ priority: 'high' });

  function passer(semaphore: ReturnType<typeof createSemaphore>) {
    const order: string[] = [];
    const queue = (label: string, ticket?: PriorityTicket) =>
      semaphore.acquire(undefined, ticket).then((release) => {
        order.push(label);
        release();
      });
    return { order, queue };
  }

  it('admits high waiters before normal and low ones queued ahead of them, FIFO within each', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const { order, queue } = passer(semaphore);
    const waits = [
      queue('bg1', low()),
      queue('fg1'),
      queue('hi1', high()),
      queue('fg2'),
      queue('hi2', high()),
    ];

    held();
    await Promise.all(waits);
    expect(order).toEqual(['hi1', 'hi2', 'fg1', 'fg2', 'bg1']);
  });

  it('keeps high waiters out of the low cap, so the reserve is unchanged', async () => {
    const semaphore = createSemaphore(3, { lowReserve: 1 });
    await semaphore.acquire(undefined, low());
    await semaphore.acquire(undefined, low());
    await semaphore.acquire(undefined, high());
    expect(semaphore.inFlight).toBe(3);
  });

  it('promotes a low ticket straight to high, merging by arrival order', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const ticket = low();
    const { order, queue } = passer(semaphore);
    const waits = [queue('bgA', ticket), queue('fgB'), queue('hiC', high())];

    semaphore.promote(ticket, 'high');
    expect(ticket.priority).toBe('high');
    held();
    await Promise.all(waits);
    expect(order).toEqual(['bgA', 'hiC', 'fgB']);
  });

  it('promotes a normal-promoted ticket on to high', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const ticket = low();
    const { order, queue } = passer(semaphore);
    const waits = [queue('fgA'), queue('bgB', ticket)];

    semaphore.promote(ticket);
    semaphore.promote(ticket, 'high');
    held();
    await Promise.all(waits);
    expect(order).toEqual(['bgB', 'fgA']);
  });

  it('never demotes: promoting a high ticket to normal leaves it high', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const ticket = high();
    const { order, queue } = passer(semaphore);
    const waits = [queue('fgA'), queue('hiB', ticket)];

    semaphore.promote(ticket, 'normal');
    expect(ticket.priority).toBe('high');
    held();
    await Promise.all(waits);
    expect(order).toEqual(['hiB', 'fgA']);
  });

  it('still drains normal and low once the high lane empties', async () => {
    const semaphore = createSemaphore(1, { lowReserve: 0 });
    const held = await semaphore.acquire(undefined, high());
    const { order, queue } = passer(semaphore);
    const waits = [queue('bg', low()), queue('fg'), queue('hi', high())];

    held();
    await Promise.all(waits);
    expect(order).toEqual(['hi', 'fg', 'bg']);
    expect(semaphore.inFlight).toBe(0);
  });

  it('frees an aborted high waiter’s place in the queue', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const controller = new AbortController();
    const abandoned = semaphore.acquire(controller.signal, high());
    const { order, queue } = passer(semaphore);
    const next = queue('fg');

    controller.abort();
    await expect(abandoned).rejects.toThrow();
    held();
    await next;
    expect(order).toEqual(['fg']);
    expect(semaphore.inFlight).toBe(0);
  });
});
