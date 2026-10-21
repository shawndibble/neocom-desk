import { describe, expect, it, vi } from 'vitest';
import type { MailQueueItem } from '@/engine/corpTaxBook/mailQueue';
import { runMailQueue, stepQueue, type QueueDeps } from './mailQueueRunner';

function item(n: number, patch: Partial<MailQueueItem> = {}): MailQueueItem {
  return {
    id: `m${n}`,
    batchId: 'b',
    corporationId: 1,
    statementId: `s${n}`,
    kind: 'statement',
    senderCharacterId: 7,
    recipientId: 100 + n,
    recipientName: `Miner ${n}`,
    amount: 1,
    subject: 's',
    body: 'b',
    order: n,
    status: 'waiting',
    createdAt: 0,
    attempts: 0,
    ...patch,
  };
}

function harness(initial: MailQueueItem[], overrides: Partial<QueueDeps> = {}) {
  const rows = new Map(initial.map((i) => [i.id, i]));
  let clock = 1_000_000;
  const deps: QueueDeps = {
    now: () => clock,
    random: () => 0,
    list: async () => [...rows.values()],
    save: async (items) => items.forEach((i) => rows.set(i.id, i)),
    send: vi.fn(async () => 555),
    log: vi.fn(async () => undefined),
    ...overrides,
  };
  return { rows, deps, advance: (ms: number) => (clock += ms) };
}

describe('stepQueue', () => {
  it('sends the head, saves it sent and logged, and waits the send gap', async () => {
    const h = harness([item(2), item(1)]);
    const step = await stepQueue(h.deps);
    expect(h.deps.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(h.deps.send).mock.calls[0][0].id).toBe('m1');
    expect(h.rows.get('m1')).toMatchObject({ status: 'sent', mailId: 555, logged: true });
    expect(h.rows.get('m2')?.status).toBe('waiting');
    expect(step.delayMs).toBe(12_000);
    expect(h.deps.log).toHaveBeenCalledTimes(1);
  });

  it('drops a removal notice the precheck says is no longer due, and sends nothing (#4621)', async () => {
    const isStillDue = vi.fn(async () => false);
    const drop = vi.fn(async (ids: readonly string[]) => ids.forEach((id) => h.rows.delete(id)));
    const h = harness([item(1, { kind: 'removal', feederCorporationId: 2 })], { isStillDue, drop });
    await stepQueue(h.deps);
    expect(isStillDue).toHaveBeenCalledTimes(1);
    expect(h.deps.send).not.toHaveBeenCalled();
    expect(drop).toHaveBeenCalledWith(['m1']);
    expect(h.rows.has('m1')).toBe(false);
  });

  it('sends a removal notice the precheck still wants', async () => {
    const h = harness([item(1, { kind: 'removal', feederCorporationId: 2 })], {
      isStillDue: async () => true,
      drop: vi.fn(async () => undefined),
    });
    await stepQueue(h.deps);
    expect(h.deps.send).toHaveBeenCalledTimes(1);
  });

  it('never sends when the precheck cannot tell: the mail fails for a Retry', async () => {
    const h = harness([item(1, { kind: 'removal', feederCorporationId: 2 })], {
      isStillDue: async () => {
        throw Object.assign(new Error('permission-denied'), { status: 403 });
      },
      drop: vi.fn(async () => undefined),
    });
    await stepQueue(h.deps);
    expect(h.deps.send).not.toHaveBeenCalled();
    expect(h.rows.get('m1')?.status).toBe('failed');
  });

  it('is done (null delay) once nothing is waiting', async () => {
    const h = harness([item(1, { status: 'sent', logged: true, mailId: 1 })]);
    expect((await stepQueue(h.deps)).delayMs).toBeNull();
    expect(h.deps.send).not.toHaveBeenCalled();
  });

  it('holds the whole queue for remainingTime on a 520 and keeps the mail waiting', async () => {
    const send = vi.fn<QueueDeps['send']>(async () => {
      throw Object.assign(new Error('MailStopSpamming'), {
        status: 520,
        body: { error: 'MailStopSpamming', remainingTime: 48 },
      });
    });
    const h = harness([item(1), item(2)], { send });
    const step = await stepQueue(h.deps);
    expect(step.delayMs).toBe(49_000);
    for (const id of ['m1', 'm2']) {
      expect(h.rows.get(id)).toMatchObject({
        status: 'waiting',
        holdReason: 'rateLimit',
        notBefore: 1_000_000 + 49_000,
        attempts: 0,
      });
    }
    // Still held: the next step only waits, and sends nothing.
    h.advance(10_000);
    const again = await stepQueue(h.deps);
    expect(again.delayMs).toBe(39_000);
    expect(send).toHaveBeenCalledTimes(1);
    // Hold over: the same mail goes out.
    h.advance(40_000);
    send.mockResolvedValueOnce(9);
    await stepQueue(h.deps);
    expect(h.rows.get('m1')).toMatchObject({ status: 'sent', mailId: 9 });
  });

  it('fails a refused mail with its reason and moves on to the next', async () => {
    const send = vi
      .fn<QueueDeps['send']>()
      .mockRejectedValueOnce(Object.assign(new Error('CSPA charge'), { status: 400 }))
      .mockResolvedValueOnce(2);
    const h = harness([item(1), item(2)], { send });
    await stepQueue(h.deps);
    expect(h.rows.get('m1')).toMatchObject({
      status: 'failed',
      failureReason: 'cspa',
      attempts: 1,
    });
    await stepQueue(h.deps);
    expect(h.rows.get('m2')?.status).toBe('sent');
  });

  it('holds, not fails, when offline', async () => {
    const send = vi.fn<QueueDeps['send']>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const h = harness([item(1)], { send });
    const step = await stepQueue(h.deps, (e) => e instanceof TypeError);
    expect(step.delayMs).toBe(30_000);
    expect(h.rows.get('m1')).toMatchObject({ status: 'waiting', holdReason: 'offline' });
  });

  it('never re-sends a mail whose audit log failed; it retries the log', async () => {
    const log = vi
      .fn<QueueDeps['log']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const h = harness([item(1)], { log });
    await stepQueue(h.deps);
    expect(h.rows.get('m1')).toMatchObject({ status: 'sent' });
    expect(h.rows.get('m1')?.logged).toBeFalsy();
    const step = await stepQueue(h.deps);
    expect(h.deps.send).toHaveBeenCalledTimes(1);
    expect(h.rows.get('m1')?.logged).toBe(true);
    expect(step.delayMs).toBeNull();
  });

  it('fails, not re-sends, a mail whose request may have landed (timeout)', async () => {
    const send = vi.fn<QueueDeps['send']>(async () => {
      throw new Error('timeout');
    });
    const h = harness([item(1)], { send, isUnconfirmed: () => true });
    await stepQueue(h.deps, () => true);
    expect(h.rows.get('m1')).toMatchObject({ status: 'failed', failureReason: 'other' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports which mail is in flight, then clears it', async () => {
    const sending = vi.fn();
    const h = harness([item(1)], { sending });
    await stepQueue(h.deps);
    expect(sending.mock.calls).toEqual([['m1'], [undefined]]);
  });
});

describe('runMailQueue', () => {
  it('works the queue to the end, pausing between mails', async () => {
    const h = harness([item(1), item(2), item(3)]);
    const waits: number[] = [];
    const ran = await runMailQueue(h.deps, new AbortController().signal, {
      locks: undefined,
      wait: async (ms) => {
        waits.push(ms);
        h.advance(ms);
        return true;
      },
    });
    expect(ran).toBe(true);
    expect([...h.rows.values()].every((i) => i.status === 'sent')).toBe(true);
    expect(waits).toEqual([12_000, 12_000, 12_000]);
  });

  it('stops when aborted', async () => {
    const h = harness([item(1), item(2)]);
    const controller = new AbortController();
    await runMailQueue(h.deps, controller.signal, {
      wait: async () => {
        controller.abort();
        return false;
      },
    });
    expect(h.rows.get('m1')?.status).toBe('sent');
    expect(h.rows.get('m2')?.status).toBe('waiting');
  });

  it('leaves the queue to the tab that holds the lock', async () => {
    const h = harness([item(1)]);
    const locks = {
      request: async (_n: string, _o: unknown, cb: (l: unknown) => unknown) => cb(null),
    };
    const ran = await runMailQueue(h.deps, new AbortController().signal, { locks });
    expect(ran).toBe(false);
    expect(h.deps.send).not.toHaveBeenCalled();
  });
});
