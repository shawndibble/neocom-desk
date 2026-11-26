import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import type { MailQueueItem } from '@/engine/corpTaxBook/mailQueue';
import { useReloadOnRecordedMail } from './useReloadOnRecordedMail';

const CORP = 98000001;
const item = (id: string, over: Partial<MailQueueItem> = {}) =>
  ({
    id,
    batchId: 'b',
    corporationId: CORP,
    statementId: `n-${id}`,
    kind: 'notice',
    senderCharacterId: 7,
    recipientId: 1,
    recipientName: 'Ada',
    amount: 1,
    subject: 's',
    body: 'b',
    order: 0,
    status: 'sent',
    ...over,
  }) as MailQueueItem;

afterEach(async () => {
  await db.corpMailQueue.clear();
});

describe('useReloadOnRecordedMail', () => {
  it('re-reads the book once a notice mail of this corporation is recorded, not for one before', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await db.corpMailQueue.put(item('old', { logged: true }));
      const reload = vi.fn();
      const { result } = renderHook(() => useReloadOnRecordedMail(CORP, reload, true));
      await waitFor(() => expect(result.current.recorded).toBe(1));
      await db.corpMailQueue.put(item('other', { logged: true, corporationId: 1 }));
      await db.corpMailQueue.put(item('new'));
      vi.advanceTimersByTime(5_000);
      expect(reload).not.toHaveBeenCalled();
      await db.corpMailQueue.update('new', { logged: true });
      await waitFor(() => expect(result.current.recorded).toBe(2));
      expect(reload).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2_000);
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
