// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webPushSupport } from './webPushSupport';

describe('webPushSupport', () => {
  const originalNotification = globalThis.Notification;
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  const originalUserAgent = navigator.userAgent;
  const originalMatchMedia = window.matchMedia;

  function setUserAgent(value: string) {
    Object.defineProperty(navigator, 'userAgent', { value, configurable: true });
  }
  function setStandalone(matches: boolean) {
    window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
  }

  beforeEach(() => {
    // @ts-expect-error -- test-only stub
    globalThis.Notification = function Notification() {};
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    setStandalone(false);
  });

  afterEach(() => {
    globalThis.Notification = originalNotification;
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    }
    setUserAgent(originalUserAgent);
    window.matchMedia = originalMatchMedia;
  });

  it('is unsupported with no Notification API', () => {
    // @ts-expect-error -- test-only
    globalThis.Notification = undefined;
    expect(webPushSupport()).toBe('unsupported');
  });

  it('is unsupported with no serviceWorker in navigator', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
    expect(webPushSupport()).toBe('unsupported');
  });

  it('requires install on iOS Safari when not running standalone', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
    setStandalone(false);
    expect(webPushSupport()).toBe('requires-install');
  });

  it('requires install on real non-installed iOS Safari, where Notification is undefined', () => {
    // Non-installed iOS Safari has no `Notification` global at all — the
    // iOS-not-installed check must win over the unsupported check, or the
    // install-required explainer never renders on the one platform it exists
    // for (see NotificationPermissionPrompt.tsx's own comment on this).
    // @ts-expect-error -- test-only: real non-installed iOS Safari has no Notification global
    globalThis.Notification = undefined;
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
    setStandalone(false);
    expect(webPushSupport()).toBe('requires-install');
  });

  it('is supported on iOS Safari once running standalone (installed PWA)', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
    setStandalone(true);
    expect(webPushSupport()).toBe('supported');
  });

  it('is supported on a non-iOS browser regardless of standalone state', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120');
    setStandalone(false);
    expect(webPushSupport()).toBe('supported');
  });
});
