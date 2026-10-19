import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  ONBOARDING_BANNER_PRIORITY,
  selectVisibleBanner,
  useOnboardingBannerSlot,
  useOnboardingBannerSlots,
} from './onboardingBannerSlot';

beforeEach(() => {
  useOnboardingBannerSlots.setState({ eligible: {} });
});

describe('selectVisibleBanner', () => {
  it('returns null when nothing is eligible', () => {
    expect(selectVisibleBanner({})).toBeNull();
    expect(
      selectVisibleBanner({ 'corp-grant': false, notifications: false, install: false })
    ).toBeNull();
  });

  it('returns the only eligible banner regardless of its priority', () => {
    expect(selectVisibleBanner({ install: true })).toBe('install');
    expect(selectVisibleBanner({ notifications: true })).toBe('notifications');
    expect(selectVisibleBanner({ 'corp-grant': true })).toBe('corp-grant');
  });

  it('returns the highest-priority banner when several are eligible', () => {
    expect(selectVisibleBanner({ install: true, notifications: true })).toBe('notifications');
    expect(selectVisibleBanner({ install: true, notifications: true, 'corp-grant': true })).toBe(
      'corp-grant'
    );
  });

  it('follows the declared priority order', () => {
    expect([...ONBOARDING_BANNER_PRIORITY]).toEqual(['corp-grant', 'notifications', 'install']);
  });
});

describe('useOnboardingBannerSlot', () => {
  it('lets a lone eligible banner render', () => {
    const { result } = renderHook(() => useOnboardingBannerSlot('install', true));
    expect(result.current).toBe(true);
  });

  it('never renders an ineligible banner', () => {
    const { result } = renderHook(() => useOnboardingBannerSlot('install', false));
    expect(result.current).toBe(false);
  });

  // No forced `rerender()` anywhere below: a losing banner re-rendering itself
  // off its own store subscription is the whole mechanism, and a forced
  // rerender would hide a broken subscription by re-reading the store anyway.
  it('grants the slot to the highest-priority claimant only', () => {
    const install = renderHook(() => useOnboardingBannerSlot('install', true));
    expect(install.result.current).toBe(true);

    const notifications = renderHook(() => useOnboardingBannerSlot('notifications', true));

    expect(notifications.result.current).toBe(true);
    expect(install.result.current).toBe(false);
  });

  it('hands the slot to the next claimant once the winner stops being eligible', () => {
    const install = renderHook(() => useOnboardingBannerSlot('install', true));
    const notifications = renderHook(
      ({ eligible }) => useOnboardingBannerSlot('notifications', eligible),
      { initialProps: { eligible: true } }
    );
    expect(install.result.current).toBe(false);

    act(() => notifications.rerender({ eligible: false }));

    expect(notifications.result.current).toBe(false);
    expect(install.result.current).toBe(true);
  });

  it('releases the slot when the winning banner unmounts', () => {
    const install = renderHook(() => useOnboardingBannerSlot('install', true));
    const notifications = renderHook(() => useOnboardingBannerSlot('notifications', true));
    expect(install.result.current).toBe(false);

    act(() => notifications.unmount());

    expect(install.result.current).toBe(true);
  });
});
