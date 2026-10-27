import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emitUpgradeBlocked } from '@/db/blockedSignal';
import { subscribeToUpgradeBlockedReports } from './upgradeBlockedReport';

const { captureMessage } = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock('@sentry/react', () => ({ captureMessage }));

beforeEach(() => captureMessage.mockClear());

describe('subscribeToUpgradeBlockedReports', () => {
  it('reports a blocked upgrade with both schema versions', () => {
    const unsubscribe = subscribeToUpgradeBlockedReports();
    // Native IndexedDB numbers — Dexie v10 -> v11.
    emitUpgradeBlocked({ oldVersion: 100, newVersion: 110 });
    expect(captureMessage).toHaveBeenCalledWith('IndexedDB upgrade blocked by another connection', {
      level: 'warning',
      tags: { subsystem: 'boot' },
      extra: { oldVersion: 100, newVersion: 110 },
    });
    unsubscribe();
  });

  it('names a blocked delete as a delete, matching how Dexie reads the event', () => {
    const unsubscribe = subscribeToUpgradeBlockedReports();
    emitUpgradeBlocked({ oldVersion: 110, newVersion: null });
    expect(captureMessage).toHaveBeenCalledWith(
      'IndexedDB delete blocked by another connection',
      expect.anything()
    );
    unsubscribe();
  });

  it('stops reporting once unsubscribed', () => {
    subscribeToUpgradeBlockedReports()();
    emitUpgradeBlocked({ oldVersion: 100, newVersion: 110 });
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('survives a throwing listener, so one report cannot break another', () => {
    const unsubscribe = subscribeToUpgradeBlockedReports();
    captureMessage.mockImplementationOnce(() => {
      throw new Error('sentry down');
    });
    expect(() => emitUpgradeBlocked({ oldVersion: 100, newVersion: 110 })).not.toThrow();
    unsubscribe();
  });
});
