import { describe, expect, it, vi } from 'vitest';
import { runDailyHousekeeping } from './dailyHousekeeping.js';

describe('runDailyHousekeeping', () => {
  it('runs every task in order', async () => {
    const order: string[] = [];
    await runDailyHousekeeping(
      [
        { name: 'a', run: async () => void order.push('a') },
        { name: 'b', run: async () => void order.push('b') },
      ],
      vi.fn()
    );
    expect(order).toEqual(['a', 'b']);
  });

  it('still runs later tasks after one fails, then fails the run naming the failures', async () => {
    const ran: string[] = [];
    const logError = vi.fn();
    const tasks = [
      {
        name: 'a',
        run: async () => {
          throw new TypeError('boom');
        },
      },
      { name: 'b', run: async () => void ran.push('b') },
    ];
    await expect(runDailyHousekeeping(tasks, logError)).rejects.toThrow(/a/);
    expect(ran).toEqual(['b']);
    expect(logError).toHaveBeenCalledWith('Daily housekeeping task failed', {
      task: 'a',
      error: 'TypeError',
    });
  });
});
