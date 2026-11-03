import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import { buildPwaShortcuts } from './pwaShortcuts';

describe('buildPwaShortcuts', () => {
  const shortcuts = buildPwaShortcuts(en.app.shortcuts);

  it('lists at most four shortcuts with in-scope absolute-path urls', () => {
    expect(shortcuts.length).toBeLessThanOrEqual(4);
    expect(shortcuts.map((s) => s.url)).toEqual([
      '/alerts',
      '/mail',
      '/wallet/balance',
      '/market/orders',
    ]);
  });

  it('uses existing icons of 96px or larger', () => {
    for (const s of shortcuts) {
      for (const icon of s.icons) {
        expect(existsSync(`public/${icon.src}`)).toBe(true);
        expect(Number(icon.sizes.split('x')[0])).toBeGreaterThanOrEqual(96);
      }
    }
  });

  it('has non-empty, short names', () => {
    for (const s of shortcuts) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.name.length).toBeLessThanOrEqual(14);
    }
  });

  it('is mirrored in twa/twa-manifest.json (docs/ANDROID-TWA.md)', () => {
    const twa = JSON.parse(readFileSync('twa/twa-manifest.json', 'utf-8')) as {
      shortcuts: { name: string; url: string }[];
    };
    expect(twa.shortcuts.map((s) => [s.name, s.url])).toEqual(
      shortcuts.map((s) => [s.name, `https://neocomdesk.com${s.url}`])
    );
  });

  it('gives each twa shortcut the icon field Bubblewrap reads', () => {
    // Bubblewrap's ShortcutInfo throws "must have either chosenIconUrl or
    // chosenMonochromeIconUrl" on a web-manifest-style `icons` array, so
    // `bubblewrap update` fails before it builds anything.
    const twa = JSON.parse(readFileSync('twa/twa-manifest.json', 'utf-8')) as {
      shortcuts: Record<string, unknown>[];
    };
    for (const s of twa.shortcuts) {
      expect(s).not.toHaveProperty('icons');
      expect(s.chosenIconUrl).toMatch(/^https:\/\/neocomdesk\.com\/icons\/.+\.png$/);
    }
  });

  it('keeps the twa minSdkVersion at what androidbrowserhelper needs', () => {
    // androidbrowserhelper 2.7.x (bundled by Bubblewrap 1.27) declares minSdk 24;
    // a lower value fails the Gradle manifest merge.
    const twa = JSON.parse(readFileSync('twa/twa-manifest.json', 'utf-8')) as {
      minSdkVersion: number;
    };
    expect(twa.minSdkVersion).toBeGreaterThanOrEqual(24);
  });
});
