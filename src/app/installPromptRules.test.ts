import { describe, it, expect } from 'vitest';
import {
  detectInstallPlatform,
  selectInstallPromptVariant,
  selectInstallAppVariant,
} from './installPromptRules';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipadSafari:
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ Safari asks for the desktop site by default: a Mac UA.
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.109 Mobile/15E148 Safari/604.1',
  iosFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/119.0 Mobile/15E148 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 13; Mobile; rv:119.0) Gecko/119.0 Firefox/119.0',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  desktopFirefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
};

describe('detectInstallPlatform', () => {
  it('detects iPhone and iPad Safari', () => {
    expect(detectInstallPlatform(UA.iphoneSafari, 5)).toBe('ios-safari');
    expect(detectInstallPlatform(UA.ipadSafari, 5)).toBe('ios-safari');
  });

  it('detects an iPad in desktop-site mode by its touch points', () => {
    expect(detectInstallPlatform(UA.ipadDesktopMode, 5)).toBe('ios-safari');
  });

  it('treats a real Mac (no touch) as desktop', () => {
    expect(detectInstallPlatform(UA.macSafari, 0)).toBeNull();
  });

  it('separates other iOS browsers from Safari', () => {
    expect(detectInstallPlatform(UA.iosChrome, 5)).toBe('ios-other');
    expect(detectInstallPlatform(UA.iosFirefox, 5)).toBe('ios-other');
  });

  it('separates Firefox for Android from the Chromium browsers', () => {
    expect(detectInstallPlatform(UA.androidChrome, 5)).toBe('android');
    expect(detectInstallPlatform(UA.androidFirefox, 5)).toBe('android-firefox');
  });

  it('returns null on desktop browsers', () => {
    expect(detectInstallPlatform(UA.desktopChrome, 0)).toBeNull();
    expect(detectInstallPlatform(UA.desktopFirefox, 0)).toBeNull();
  });
});

describe('selectInstallPromptVariant', () => {
  const base = {
    seen: false,
    isStandalone: false,
    deferredPromptAvailable: false,
    platform: 'android' as const,
  };

  it('shows nothing once seen', () => {
    expect(selectInstallPromptVariant({ ...base, seen: true, deferredPromptAvailable: true })).toBe(
      'none'
    );
  });

  it('shows nothing when already installed (standalone)', () => {
    expect(
      selectInstallPromptVariant({ ...base, isStandalone: true, deferredPromptAvailable: true })
    ).toBe('none');
  });

  it('shows nothing on desktop, even when the native prompt is available', () => {
    expect(
      selectInstallPromptVariant({ ...base, platform: null, deferredPromptAvailable: true })
    ).toBe('none');
  });

  it('prefers the native prompt on Android when beforeinstallprompt fired', () => {
    expect(selectInstallPromptVariant({ ...base, deferredPromptAvailable: true })).toBe('native');
  });

  it('waits for the native prompt on Android Chromium rather than showing instructions', () => {
    expect(selectInstallPromptVariant(base)).toBe('none');
  });

  it('shows menu instructions on Firefox for Android, which has no native prompt', () => {
    expect(selectInstallPromptVariant({ ...base, platform: 'android-firefox' })).toBe(
      'android-firefox'
    );
  });

  it('gives Safari and other iOS browsers their own instructions', () => {
    expect(selectInstallPromptVariant({ ...base, platform: 'ios-safari' })).toBe('ios-safari');
    expect(selectInstallPromptVariant({ ...base, platform: 'ios-other' })).toBe('ios-other');
  });
});

describe('selectInstallAppVariant', () => {
  const base = { isStandalone: false, deferredPromptAvailable: false, platform: null } as const;

  const android = { ...base, platform: 'android' } as const;

  it('hides on desktop, whatever the browser offers', () => {
    expect(selectInstallAppVariant({ ...base })).toBe('none');
    expect(selectInstallAppVariant({ ...base, deferredPromptAvailable: true })).toBe('none');
    expect(selectInstallAppVariant({ ...base, isStandalone: true })).toBe('none');
  });

  it('reports installed when already standalone', () => {
    expect(
      selectInstallAppVariant({ ...android, isStandalone: true, deferredPromptAvailable: true })
    ).toBe('installed');
  });

  it('prefers the native prompt whenever the browser offered one', () => {
    expect(selectInstallAppVariant({ ...android, deferredPromptAvailable: true })).toBe('native');
  });

  it('gives per-browser steps where the event never fires', () => {
    expect(selectInstallAppVariant({ ...base, platform: 'ios-safari' })).toBe('ios-safari');
    expect(selectInstallAppVariant({ ...base, platform: 'ios-other' })).toBe('ios-other');
    expect(selectInstallAppVariant({ ...base, platform: 'android-firefox' })).toBe(
      'android-firefox'
    );
  });

  it('falls back to a browser-menu pointer on Android Chromium', () => {
    expect(selectInstallAppVariant({ ...android })).toBe('menu');
  });
});
