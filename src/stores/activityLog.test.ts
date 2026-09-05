import { describe, it, expect, beforeEach } from 'vitest';
import { emitEsiActivity, type ActivityEvent } from '@/esi/activityLog';
import { useActivityLog, subscribeToEsiActivity, MAX_ACTIVITY_ENTRIES } from './activityLog';

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    endpointId: 'getCharacterSkills',
    characterId: 123,
    timestamp: Date.now(),
    outcome: 'success',
    ...overrides,
  };
}

beforeEach(() => {
  useActivityLog.setState({ entries: [] });
});

describe('useActivityLog.record', () => {
  it('prepends new entries, most recent first', () => {
    useActivityLog.getState().record(event({ endpointId: 'getCharacterSkills' }));
    useActivityLog.getState().record(event({ endpointId: 'getCharacterWallet' }));

    const { entries } = useActivityLog.getState();
    expect(entries.map((e) => e.endpointId)).toEqual(['getCharacterWallet', 'getCharacterSkills']);
  });

  it('gives every entry a unique id', () => {
    useActivityLog.getState().record(event());
    useActivityLog.getState().record(event());

    const { entries } = useActivityLog.getState();
    expect(entries[0].id).not.toBe(entries[1].id);
  });

  it('bounds the buffer, dropping the oldest entries past the cap', () => {
    for (let i = 0; i < MAX_ACTIVITY_ENTRIES + 10; i += 1) {
      useActivityLog.getState().record(event({ characterId: i }));
    }

    const { entries } = useActivityLog.getState();
    expect(entries).toHaveLength(MAX_ACTIVITY_ENTRIES);
    // Most recent (highest characterId) survives; the oldest 10 were dropped.
    expect(entries[0].characterId).toBe(MAX_ACTIVITY_ENTRIES + 9);
    expect(entries[entries.length - 1].characterId).toBe(10);
  });
});

describe('useActivityLog.clear', () => {
  it('empties the entries', () => {
    useActivityLog.getState().record(event());
    useActivityLog.getState().record(event());

    useActivityLog.getState().clear();

    expect(useActivityLog.getState().entries).toEqual([]);
  });
});

describe('subscribeToEsiActivity', () => {
  it('records events published on the esi activity signal', () => {
    const unsubscribe = subscribeToEsiActivity();

    emitEsiActivity(event({ endpointId: 'getCharacterOrders' }));

    expect(useActivityLog.getState().entries[0].endpointId).toBe('getCharacterOrders');
    unsubscribe();
  });

  it('stops recording after unsubscribe', () => {
    const unsubscribe = subscribeToEsiActivity();
    unsubscribe();

    emitEsiActivity(event());

    expect(useActivityLog.getState().entries).toHaveLength(0);
  });
});
