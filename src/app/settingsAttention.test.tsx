import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUpdateStatus } from './updateAvailable';
import { useStorageAtRisk } from '@/features/settings/storageAtRisk';
import { useRailSettingsNeedsAttention, useSettingsNeedsAttention } from './settingsAttention';

beforeEach(() => {
  useUpdateStatus.setState({ status: 'unknown' });
  useStorageAtRisk.setState({ atRisk: false });
});

describe('useSettingsNeedsAttention', () => {
  it('is quiet when nothing in Settings is waiting', () => {
    const { result } = renderHook(() => useSettingsNeedsAttention());
    expect(result.current).toBe(false);
  });

  it('lights for a waiting update and for unprotected storage, and clears with them', () => {
    const { result } = renderHook(() => useSettingsNeedsAttention());
    act(() => useUpdateStatus.setState({ status: 'available' }));
    expect(result.current).toBe(true);
    act(() => useUpdateStatus.setState({ status: 'current' }));
    act(() => useStorageAtRisk.setState({ atRisk: true }));
    expect(result.current).toBe(true);
    act(() => useStorageAtRisk.setState({ atRisk: false }));
    expect(result.current).toBe(false);
  });
});

describe('useRailSettingsNeedsAttention', () => {
  it('ignores a waiting update (the rail has its Upgrade icon) but lights for unprotected storage', () => {
    const { result } = renderHook(() => useRailSettingsNeedsAttention());
    act(() => useUpdateStatus.setState({ status: 'available' }));
    expect(result.current).toBe(false);
    act(() => useStorageAtRisk.setState({ atRisk: true }));
    expect(result.current).toBe(true);
  });
});
