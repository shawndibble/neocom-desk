import { describe, expect, it } from 'vitest';
import { SCHEDULED_STOP_REASONS, scheduledSyncFrom } from './scheduledSync';

describe('scheduledSyncFrom', () => {
  it('reads an active schedule with its last run', () => {
    expect(
      scheduledSyncFrom({
        status: 'active',
        characterId: 2,
        characterName: 'Pilot 2',
        enabledAt: 5,
        lastRun: { at: 9, outcome: 'synced', observedRows: 3 },
        systemIds: { '1': 2 },
      })
    ).toEqual({
      status: 'active',
      characterId: 2,
      characterName: 'Pilot 2',
      enabledAt: 5,
      lastRun: { at: 9, outcome: 'synced', observedRows: 3 },
    });
  });

  it('reads a stopped schedule and its reason', () => {
    for (const reason of SCHEDULED_STOP_REASONS) {
      expect(
        scheduledSyncFrom({
          status: 'stopped',
          characterId: 2,
          characterName: 'P',
          enabledAt: 5,
          stoppedAt: 8,
          stoppedReason: reason,
        })
      ).toMatchObject({ status: 'stopped', stoppedAt: 8, stoppedReason: reason });
    }
  });

  it('is null for nothing, or for anything malformed', () => {
    expect(scheduledSyncFrom(undefined)).toBeNull();
    expect(scheduledSyncFrom({ status: 'off' })).toBeNull();
    expect(
      scheduledSyncFrom({ status: 'active', characterId: 'x', characterName: 'P' })
    ).toBeNull();
    expect(
      scheduledSyncFrom({
        status: 'stopped',
        characterId: 2,
        characterName: 'P',
        stoppedReason: 'nope',
      })
    ).toEqual({ status: 'stopped', characterId: 2, characterName: 'P', enabledAt: 0 });
  });
});
