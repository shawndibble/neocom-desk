import { describe, expect, it, vi } from 'vitest';
import { EsiError } from '@/esi/errors';
import { sendAndSettle } from './mailSettle';

const calls = (send: () => Promise<unknown>) => ({
  send,
  release: vi.fn().mockResolvedValue(undefined),
  confirm: vi.fn().mockResolvedValue(undefined),
});

describe('sendAndSettle', () => {
  it('stamps a mail that went out', async () => {
    const c = calls(async () => 7);
    expect(await sendAndSettle(c)).toBe('sent');
    expect(c.confirm).toHaveBeenCalledTimes(1);
    expect(c.release).not.toHaveBeenCalled();
  });

  it('retries the stamp, and still reports sent when it never lands', async () => {
    const c = calls(async () => 7);
    c.confirm.mockRejectedValue(new Error('offline'));
    expect(await sendAndSettle(c)).toBe('sent');
    expect(c.confirm).toHaveBeenCalledTimes(3);
  });

  it('gives the slot back when ESI refused the mail', async () => {
    const c = calls(() => Promise.reject(new EsiError(403, 'no')));
    expect(await sendAndSettle(c)).toBe('refused');
    expect(c.release).toHaveBeenCalledTimes(1);
    expect(c.confirm).not.toHaveBeenCalled();
  });

  it('keeps the slot spent when ESI gave no answer', async () => {
    const c = calls(() => Promise.reject(new EsiError(503, 'down')));
    expect(await sendAndSettle(c)).toBe('unsure');
    expect(c.release).not.toHaveBeenCalled();
  });
});
