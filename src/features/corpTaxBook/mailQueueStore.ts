/** Dexie persistence for the Corp Tax Book send queue (issue #4064): one row per mail. */
import { db } from '@/db';
import { isAlreadyQueued, type MailQueueItem } from '@/engine/corpTaxBook/mailQueue';

export function listQueue(corporationId?: number): Promise<MailQueueItem[]> {
  const rows =
    corporationId === undefined
      ? db.corpMailQueue.toArray()
      : db.corpMailQueue.where('corporationId').equals(corporationId).toArray();
  return rows.then((all) => all.sort((a, b) => a.order - b.order));
}

export async function nextOrder(): Promise<number> {
  const all = await db.corpMailQueue.toArray();
  return all.reduce((max, i) => Math.max(max, i.order), 0) + 1;
}

/**
 * Adds mail to the queue, minus any a queued Statement already covers.
 * Returns what was added and what was skipped.
 */
export async function addToQueue(
  items: readonly MailQueueItem[]
): Promise<{ added: MailQueueItem[]; skipped: MailQueueItem[] }> {
  return db.transaction('rw', db.corpMailQueue, async () => {
    const existing = await db.corpMailQueue.toArray();
    const added: MailQueueItem[] = [];
    const skipped: MailQueueItem[] = [];
    for (const item of items) {
      if (isAlreadyQueued([...existing, ...added], item.statementId, item.kind)) skipped.push(item);
      else added.push(item);
    }
    await db.corpMailQueue.bulkPut(added);
    return { added, skipped };
  });
}

export async function saveItem(item: MailQueueItem): Promise<void> {
  await db.corpMailQueue.put(item);
}

export async function saveItems(items: readonly MailQueueItem[]): Promise<void> {
  await db.corpMailQueue.bulkPut([...items]);
}

/** Drops sent, logged mail (the "Done" run), keeping failures to retry and mail not yet logged. */
export async function clearSent(corporationId?: number): Promise<void> {
  const rows = await listQueue(corporationId);
  await db.corpMailQueue.bulkDelete(
    rows.filter((r) => r.status === 'sent' && r.logged === true).map((r) => r.id)
  );
}
