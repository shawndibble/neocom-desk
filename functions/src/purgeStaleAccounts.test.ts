import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_INACTIVITY_MS,
  STALE_ACCOUNT_BATCH_SIZE,
  STALE_ACCOUNT_MAX_PASSES,
  decideAccountAction,
  isAccountStale,
  lastSyncedAtOf,
  staleAccountCutoff,
} from './purgeStaleAccounts.js';

const NOW = 1_800_000_000_000;

describe('ACCOUNT_INACTIVITY_MS', () => {
  it('is 90 days', () => {
    expect(ACCOUNT_INACTIVITY_MS).toBe(90 * 24 * 3_600_000);
  });
});

describe('staleAccountCutoff', () => {
  it('is now minus the inactivity window', () => {
    expect(staleAccountCutoff(NOW)).toBe(NOW - ACCOUNT_INACTIVITY_MS);
  });
});

describe('isAccountStale', () => {
  it('is not stale exactly at the 90-day boundary', () => {
    expect(isAccountStale(NOW - ACCOUNT_INACTIVITY_MS, NOW)).toBe(false);
  });
  it('is stale one millisecond past the boundary', () => {
    expect(isAccountStale(NOW - ACCOUNT_INACTIVITY_MS - 1, NOW)).toBe(true);
  });
  it('is not stale for a recent sync', () => {
    expect(isAccountStale(NOW - 1000, NOW)).toBe(false);
  });
});

describe('lastSyncedAtOf', () => {
  it('reads a finite number', () => {
    expect(lastSyncedAtOf({ lastSyncedAt: 5 })).toBe(5);
  });
  it('is undefined for a missing doc, a missing field, or a non-number', () => {
    expect(lastSyncedAtOf(undefined)).toBeUndefined();
    expect(lastSyncedAtOf({})).toBeUndefined();
    expect(lastSyncedAtOf({ lastSyncedAt: 'x' })).toBeUndefined();
    expect(lastSyncedAtOf({ lastSyncedAt: Number.NaN })).toBeUndefined();
  });
});

describe('decideAccountAction', () => {
  it('seeds an account with no heartbeat instead of deleting it', () => {
    expect(decideAccountAction(undefined, NOW)).toBe('seed');
  });
  it('purges an account whose heartbeat is past the window', () => {
    expect(decideAccountAction(NOW - ACCOUNT_INACTIVITY_MS - 1, NOW)).toBe('purge');
  });
  it('keeps an account synced recently, even if no document changed', () => {
    expect(decideAccountAction(NOW - 1000, NOW)).toBe('keep');
  });
  it('keeps a freshly seeded account until a full window has passed', () => {
    expect(decideAccountAction(NOW, NOW + ACCOUNT_INACTIVITY_MS)).toBe('keep');
    expect(decideAccountAction(NOW, NOW + ACCOUNT_INACTIVITY_MS + 1)).toBe('purge');
  });
});

describe('bounds', () => {
  it('keeps a batch within the Firestore write cap', () => {
    expect(STALE_ACCOUNT_BATCH_SIZE).toBeLessThanOrEqual(500);
    expect(STALE_ACCOUNT_MAX_PASSES).toBeGreaterThan(0);
  });
});
