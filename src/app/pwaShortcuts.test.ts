import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import { buildPwaShortcuts } from './pwaShortcuts';

describe('buildPwaShortcuts', () => {
  const shortcuts = buildPwaShortcuts(en.app.shortcuts);

  it('lists at most four shortcuts with in-scope absolute-path urls', () => {
    expect(shortcuts.length).toBeLessThanOrEqual(4);
    expect(shortcuts.map((s) => s.url)).toEqual([
      '/travel',
      '/travel/pilot',
      '/alerts',
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
});
