import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import { BOOT_TIP_KEYS, getBootTip, nextBootTip, pickBootTip, resetBootTip } from './bootTips';

const lookup = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      en
    );

describe('bootTips', () => {
  it('every tip key has copy in en.json, and every en.json tip is listed', () => {
    for (const key of BOOT_TIP_KEYS) {
      expect(typeof lookup(key), key).toBe('string');
    }
    const listed = BOOT_TIP_KEYS.map((key) => key.replace('boot.tips.', '')).sort();
    expect(Object.keys(en.boot.tips).sort()).toEqual(listed);
  });

  it('pickBootTip maps the random range onto the list, including the top edge', () => {
    expect(pickBootTip(() => 0)).toBe(BOOT_TIP_KEYS[0]);
    expect(pickBootTip(() => 0.999999)).toBe(BOOT_TIP_KEYS[BOOT_TIP_KEYS.length - 1]);
    expect(pickBootTip(() => 1)).toBe(BOOT_TIP_KEYS[BOOT_TIP_KEYS.length - 1]);
  });

  it('nextBootTip never returns the current tip', () => {
    for (const current of BOOT_TIP_KEYS) {
      for (const r of [0, 0.3, 0.7, 1]) {
        expect(nextBootTip(current, () => r)).not.toBe(current);
      }
    }
  });

  it('getBootTip is stable until reset', () => {
    resetBootTip();
    const first = getBootTip();
    for (let i = 0; i < 20; i++) expect(getBootTip()).toBe(first);
  });
});
