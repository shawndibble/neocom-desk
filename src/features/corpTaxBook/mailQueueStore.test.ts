import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import type { MailQueueItem } from '@/engine/corpTaxBook/mailQueue';
import { addToQueue, nextOrder } from './mailQueueStore';

function item(n: number, patch: Partial<MailQueueItem> = {}): MailQueueItem {
  return {
    id: `m${n}`,
    batchId: 'b',
    corporationId: 1,
    statementId: `s${n}`,
    kind: 'notice',
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

beforeEach(async () => {
  await db.corpMailQueue.clear();
});

describe('nextOrder', () => {
  it('is 1 on an empty queue', async () => {
    expect(await nextOrder()).toBe(1);
  });

  it('is one past the highest order, whatever the insert order', async () => {
    await db.corpMailQueue.bulkPut([item(5), item(2), item(9), item(9, { id: 'tie' })]);
    expect(await nextOrder()).toBe(10);
  });

  it('floors at 1 when every order is negative', async () => {
    await db.corpMailQueue.bulkPut([item(1, { order: -4 })]);
    expect(await nextOrder()).toBe(1);
  });
});

describe('addToQueue', () => {
  it('skips a Statement already queued, in the DB or earlier in the same call', async () => {
    await db.corpMailQueue.put(item(1));
    const dupe = item(2, { statementId: 's3' });
    const { added, skipped } = await addToQueue([item(10, { statementId: 's1' }), item(3), dupe]);
    expect(skipped.map((i) => i.id)).toEqual(['m10', 'm2']);
    expect(added.map((i) => i.id)).toEqual(['m3']);
    expect(await db.corpMailQueue.count()).toBe(2);
  });

  it('lets a reminder queue again once the earlier one is sent, but not while waiting', async () => {
    await db.corpMailQueue.put(item(1, { kind: 'reminder', status: 'sent' }));
    const again = await addToQueue([item(2, { statementId: 's1', kind: 'reminder' })]);
    expect(again.added).toHaveLength(1);
    const blocked = await addToQueue([item(3, { statementId: 's1', kind: 'reminder' })]);
    expect(blocked.skipped).toHaveLength(1);
  });

  it('queues a different kind for the same Statement', async () => {
    await db.corpMailQueue.put(item(1));
    const r = await addToQueue([item(2, { statementId: 's1', kind: 'reminder' })]);
    expect(r.added).toHaveLength(1);
  });
});
