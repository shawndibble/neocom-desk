import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAppBadgeCount } from './badge';

const setAppBadge = vi.fn(async () => {});
const clearAppBadge = vi.fn(async () => {});

beforeEach(() => {
  setAppBadge.mockClear();
  clearAppBadge.mockClear();
  vi.stubGlobal('navigator', { setAppBadge, clearAppBadge });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('setAppBadgeCount', () => {
  it('sets the count when there is something to show', async () => {
    await setAppBadgeCount(3);
    expect(setAppBadge).toHaveBeenCalledWith(3);
    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  it('clears rather than setting zero', async () => {
    await setAppBadgeCount(0);
    expect(clearAppBadge).toHaveBeenCalled();
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it('is a no-op on a platform without the API (Android, desktop Firefox)', async () => {
    vi.stubGlobal('navigator', {});
    await expect(setAppBadgeCount(2)).resolves.toBeUndefined();
  });

  it('swallows a rejection rather than failing the write that prompted it', async () => {
    vi.stubGlobal('navigator', {
      setAppBadge: vi.fn(async () => {
        throw new Error('not installed');
      }),
    });
    await expect(setAppBadgeCount(2)).resolves.toBeUndefined();
  });
});
