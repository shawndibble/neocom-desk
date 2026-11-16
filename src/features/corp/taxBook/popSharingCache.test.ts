import { beforeEach, describe, expect, it, vi } from 'vitest';
import { popSharingFrom } from '../../../../functions/src/popSharing';

const read = vi.fn();
vi.mock('./popSharingClient', () => ({ readPopSharing: (...a: unknown[]) => read(...a) }));

const { invalidatePopSharing, onPopSharingInvalidated, readPopSharingCached } =
  await import('./popSharingCache');

const ON = popSharingFrom({ enabled: true });
const OFF = popSharingFrom({ enabled: false });

describe('readPopSharingCached', () => {
  beforeEach(() => read.mockReset());

  it('reads a book once for every list that asks', async () => {
    read.mockResolvedValue(ON);
    const reads = [1, 2, 3].map(() => readPopSharingCached(9, 100, 0));
    expect(await Promise.all(reads)).toEqual([ON, ON, ON]);
    expect(read).toHaveBeenCalledTimes(1);
    await readPopSharingCached(9, 200, 0);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('reads again once an edit invalidates the book, and tells every list', async () => {
    read.mockResolvedValueOnce(ON).mockResolvedValueOnce(OFF);
    const heard = vi.fn();
    const stop = onPopSharingInvalidated(heard);
    expect(await readPopSharingCached(9, 100, 0)).toBe(ON);
    invalidatePopSharing(100);
    expect(heard).toHaveBeenCalledWith(100);
    expect(await readPopSharingCached(9, 100, 0)).toBe(OFF);
    stop();
    invalidatePopSharing(100);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('never caches a failed read, and reads again once the window passes', async () => {
    read.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(ON);
    await expect(readPopSharingCached(9, 100, 0)).rejects.toThrow('offline');
    await readPopSharingCached(9, 100, 0);
    await readPopSharingCached(9, 100, 60_000);
    expect(read).toHaveBeenCalledTimes(2);
    await readPopSharingCached(9, 100, 10 * 60_000);
    expect(read).toHaveBeenCalledTimes(3);
  });
});
