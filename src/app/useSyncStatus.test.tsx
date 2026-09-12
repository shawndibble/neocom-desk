import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { setStatus } from '@/sync/status';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useSyncStatus } from './useSyncStatus';

const CHAR_A = 1;
const CHAR_B = 2;

beforeEach(() => {
  useActiveCharacter.setState({ activeCharacterId: CHAR_A, hydrated: true });
  // `status.ts` is module state with no reset; clear both Characters so one
  // test's error does not leak into the next.
  setStatus(CHAR_A, { state: 'idle', error: null, lastSyncedAt: null });
  setStatus(CHAR_B, { state: 'idle', error: null, lastSyncedAt: null });
});

describe('useSyncStatus', () => {
  it("reports the active Character's own failure", () => {
    const { result } = renderHook(() => useSyncStatus());

    act(() => setStatus(CHAR_A, { state: 'error', error: 'token expired' }));

    expect(result.current.status).toMatchObject({ state: 'error', error: 'token expired' });
  });

  it("ignores another Character's failure, which the background sweep now surfaces routinely", () => {
    const { result } = renderHook(() => useSyncStatus());

    act(() => setStatus(CHAR_B, { state: 'error', error: 'alt has a dead refresh token' }));

    expect(result.current.status.state).toBe('idle');
    expect(result.current.status.error).toBeNull();
  });

  it('still applies a status published before any Character has synced', () => {
    const { result } = renderHook(() => useSyncStatus());

    act(() => setStatus(CHAR_A, { state: 'syncing' }));

    expect(result.current.status.state).toBe('syncing');
  });
});
