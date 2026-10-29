import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import {
  useImproveJob,
  useImproveJobByRole,
  useImproveReach,
  useImproveRigs,
  useImproveSettingsHydrated,
  useImproveSpace,
  useImproveSpaceByRole,
} from './useImprove';

beforeEach(async () => {
  await db.settings.clear();
  // A page load: every store starts from its default, unread.
  useImproveJob.setState({ value: 'pve', hydrated: false });
  useImproveSpace.setState({ value: 'dangerous', hydrated: false });
  useImproveJobByRole.setState({ value: {}, hydrated: false });
  useImproveSpaceByRole.setState({ value: {}, hydrated: false });
  useImproveRigs.setState({ value: true, hydrated: false });
  useImproveReach.setState({ value: 'upgrade', hydrated: false });
});

describe('useImproveSettingsHydrated', () => {
  it('reads the remembered Improve settings back after a reload', async () => {
    await db.settings.bulkPut([
      { key: 'fittingsImproveJob', value: 'pvp' },
      { key: 'fittingsImproveSpace', value: 'safe' },
      { key: 'fittingsImproveRigs', value: false },
      { key: 'fittingsImproveReach', value: 'rework' },
    ]);
    const { result } = renderHook(() => useImproveSettingsHydrated());
    await waitFor(() => expect(result.current).toBe(true));
    expect(useImproveJob.getState().value).toBe('pvp');
    expect(useImproveSpace.getState().value).toBe('safe');
    expect(useImproveRigs.getState().value).toBe(false);
    expect(useImproveReach.getState().value).toBe('rework');
  });

  it('reads the Job and space remembered per hull role back after a reload', async () => {
    await db.settings.bulkPut([
      { key: 'fittingsImproveJobByRole', value: { combat: 'pvp', explorer: 'explore' } },
      { key: 'fittingsImproveSpaceByRole', value: { explorer: 'safe' } },
    ]);
    const { result } = renderHook(() => useImproveSettingsHydrated());
    await waitFor(() => expect(result.current).toBe(true));
    expect(useImproveJobByRole.getState().value).toEqual({ combat: 'pvp', explorer: 'explore' });
    expect(useImproveSpaceByRole.getState().value).toEqual({ explorer: 'safe' });
  });

  it('is false until the settings are read', () => {
    const { result } = renderHook(() => useImproveSettingsHydrated());
    expect(result.current).toBe(false);
  });
});
