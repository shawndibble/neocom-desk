import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncConfigured = vi.hoisted(() => ({ value: true }));
const callRouted = vi.hoisted(() => vi.fn());

vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => syncConfigured.value }));
vi.mock('@/sync/routedCallable', () => ({ callRouted }));
vi.mock('@/features/corp/taxBook/bookClient', () => ({ call: callRouted }));
vi.mock('@/auth/session', () => ({ getValidAccessToken: () => Promise.resolve('token') }));

import { setVettingBackendOverride } from './vettingBackend';
import { vettingBackend } from './vettingClient';

describe('vettingBackend().myRequests', () => {
  beforeEach(() => {
    setVettingBackendOverride(null);
    callRouted.mockReset();
  });

  it('finds no request, without calling the backend, when no sync backend is configured', async () => {
    syncConfigured.value = false;
    await expect(vettingBackend().myRequests(42)).resolves.toEqual([]);
    expect(callRouted).not.toHaveBeenCalled();
  });
});
