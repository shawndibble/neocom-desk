export const ESI_FANOUT_CONCURRENCY = 10;

export async function mapWithConcurrencyLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

export type Release = () => void;

export type Priority = 'high' | 'normal' | 'low';

const PRIORITIES: readonly Priority[] = ['high', 'normal', 'low'];

function outranks(a: Priority, b: Priority): boolean {
  return PRIORITIES.indexOf(a) < PRIORITIES.indexOf(b);
}

export interface PriorityTicket {
  priority: Priority;
}

export interface SemaphoreOptions {
  lowReserve?: number;
}

export interface Semaphore {
  acquire(signal?: AbortSignal, ticket?: PriorityTicket): Promise<Release>;
  promote(ticket: PriorityTicket, to?: Priority): void;
  readonly inFlight: number;
}

interface Waiter {
  readonly seq: number;
  readonly ticket: PriorityTicket | undefined;
  readonly admit: (lane: Priority) => void;
}

export function createSemaphore(limit: number, options: SemaphoreOptions = {}): Semaphore {
  const lowLimit = Math.max(1, limit - (options.lowReserve ?? 0));
  let held = 0;
  let lowHeld = 0;
  let seq = 0;
  const lanes: Record<Priority, Waiter[]> = { high: [], normal: [], low: [] };

  function releaseOnce(lane: Priority): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      held -= 1;
      if (lane === 'low') lowHeld -= 1;
      drain();
    };
  }

  function nextLane(): Priority | null {
    const lane = PRIORITIES.find((priority) => lanes[priority].length > 0);
    if (lane === 'low' && lowHeld >= lowLimit) return null;
    return lane ?? null;
  }

  function drain(): void {
    while (held < limit) {
      const lane = nextLane();
      if (lane === null) return;
      const waiter = lanes[lane].shift() as Waiter;
      held += 1;
      if (lane === 'low') lowHeld += 1;
      waiter.admit(lane);
    }
  }

  return {
    get inFlight() {
      return held;
    },
    acquire(signal?: AbortSignal, ticket?: PriorityTicket): Promise<Release> {
      if (signal?.aborted) {
        return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      }
      return new Promise<Release>((resolve, reject) => {
        const onAbort = (): void => {
          for (const priority of PRIORITIES) {
            const queue = lanes[priority];
            const index = queue.indexOf(waiter);
            if (index >= 0) queue.splice(index, 1);
          }
          reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
        };
        const waiter: Waiter = {
          seq: (seq += 1),
          ticket,
          admit: (lane) => {
            signal?.removeEventListener('abort', onAbort);
            resolve(releaseOnce(lane));
          },
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        lanes[ticket?.priority ?? 'normal'].push(waiter);
        drain();
      });
    },
    promote(ticket: PriorityTicket, to: Priority = 'normal'): void {
      const from = ticket.priority;
      if (!outranks(to, from)) return;
      ticket.priority = to;
      const moving = lanes[from].filter((waiter) => waiter.ticket === ticket);
      if (moving.length === 0) return;
      lanes[from] = lanes[from].filter((waiter) => waiter.ticket !== ticket);
      lanes[to] = [...lanes[to], ...moving].sort((a, b) => a.seq - b.seq);
      drain();
    },
  };
}
