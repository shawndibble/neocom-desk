import { describe, it, expect } from 'vitest';
import { isIosSafari, selectInstallPromptVariant } from './installPromptRules';

describe('isIosSafari', () => {
  it('detects iPhone Safari', () => {
    expect(
      isIosSafari(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      )
    ).toBe(true);
  });

  it('detects iPad Safari', () => {
    expect(
      isIosSafari(
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      )
    ).toBe(true);
  });

  it('rejects Chrome on iOS (CriOS)', () => {
    expect(
      isIosSafari(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.109 Mobile/15E148 Safari/604.1'
      )
    ).toBe(false);
  });

  it('rejects desktop Chrome', () => {
    expect(
      isIosSafari(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      )
    ).toBe(false);
  });

  it('rejects Android Chrome', () => {
    expect(
      isIosSafari(
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
      )
    ).toBe(false);
  });
});

describe('selectInstallPromptVariant', () => {
  it('shows nothing once seen', () => {
    expect(
      selectInstallPromptVariant({
        seen: true,
        isStandalone: false,
        deferredPromptAvailable: true,
        isIOS: false,
      })
    ).toBe('none');
  });

  it('shows nothing when already installed (standalone)', () => {
    expect(
      selectInstallPromptVariant({
        seen: false,
        isStandalone: true,
        deferredPromptAvailable: true,
        isIOS: false,
      })
    ).toBe('none');
  });

  it('prefers the native prompt when beforeinstallprompt fired', () => {
    expect(
      selectInstallPromptVariant({
        seen: false,
        isStandalone: false,
        deferredPromptAvailable: true,
        isIOS: false,
      })
    ).toBe('native');
  });

  it('falls back to the iOS instructional banner when no native prompt is available', () => {
    expect(
      selectInstallPromptVariant({
        seen: false,
        isStandalone: false,
        deferredPromptAvailable: false,
        isIOS: true,
      })
    ).toBe('ios');
  });

  it('shows nothing on other browsers with no native prompt', () => {
    expect(
      selectInstallPromptVariant({
        seen: false,
        isStandalone: false,
        deferredPromptAvailable: false,
        isIOS: false,
      })
    ).toBe('none');
  });
});
