import { describe, it, expect } from 'vitest';
import { isSyncConfigured, syncDisplayState } from './syncStatus';

describe('isSyncConfigured', () => {
  it('is true when Firebase config is present and not under the test runner', () => {
    expect(isSyncConfigured({ MODE: 'production', VITE_FIREBASE_API_KEY: 'key' })).toBe(true);
  });

  it('is false when the Firebase API key is missing', () => {
    expect(isSyncConfigured({ MODE: 'production', VITE_FIREBASE_API_KEY: '' })).toBe(false);
    expect(isSyncConfigured({ MODE: 'production' })).toBe(false);
  });

  it('is false under the test runner even with a config present', () => {
    expect(isSyncConfigured({ MODE: 'test', VITE_FIREBASE_API_KEY: 'key' })).toBe(false);
  });

  it('defaults to reading import.meta.env (which is "test" mode in this suite)', () => {
    expect(isSyncConfigured()).toBe(false);
  });
});

describe('syncDisplayState', () => {
  it('reports offline regardless of sync state when the browser is offline', () => {
    expect(syncDisplayState({ state: 'idle', lastSyncedAt: null, error: null }, false)).toBe(
      'offline'
    );
    expect(syncDisplayState({ state: 'syncing', lastSyncedAt: null, error: null }, false)).toBe(
      'offline'
    );
  });

  it('mirrors the sync state when online', () => {
    expect(syncDisplayState({ state: 'idle', lastSyncedAt: null, error: null }, true)).toBe('idle');
    expect(syncDisplayState({ state: 'syncing', lastSyncedAt: null, error: null }, true)).toBe(
      'syncing'
    );
    expect(syncDisplayState({ state: 'error', lastSyncedAt: null, error: 'x' }, true)).toBe(
      'error'
    );
  });
});
