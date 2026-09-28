import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import {
  useFontScale,
  FONT_SCALE_KEY,
  FONT_SCALE_MIRROR_KEY,
  FONT_SCALE_STEPS,
  DEFAULT_FONT_SCALE,
} from './fontScale';

beforeEach(async () => {
  await db.settings.clear();
  useFontScale.setState({ value: DEFAULT_FONT_SCALE, hydrated: false });
  document.documentElement.style.fontSize = '';
  localStorage.clear();
});

afterEach(() => {
  document.documentElement.style.fontSize = '';
});

describe('useFontScale', () => {
  it('defaults to 100% scale, unhydrated', () => {
    expect(useFontScale.getState().value).toBe(DEFAULT_FONT_SCALE);
    expect(useFontScale.getState().hydrated).toBe(false);
  });

  it('applies each step to the root font-size on set', async () => {
    for (const step of FONT_SCALE_STEPS) {
      await useFontScale.getState().setValue(step);
      expect(document.documentElement.style.fontSize).toBe(`${step * 100}%`);
    }
  });

  it('persists the choice to Dexie under the fontScale key', async () => {
    await useFontScale.getState().setValue(1.25);
    expect((await db.settings.get(FONT_SCALE_KEY))?.value).toBe(1.25);
  });

  it('applies the persisted scale on hydrate', async () => {
    await db.settings.put({ key: FONT_SCALE_KEY, value: 1.125 });
    await useFontScale.getState().hydrate();
    expect(useFontScale.getState().value).toBe(1.125);
    expect(document.documentElement.style.fontSize).toBe('112.5%');
  });

  it('falls back to the default and applies it when the stored value is not a valid step', async () => {
    await db.settings.put({ key: FONT_SCALE_KEY, value: 3 });
    await useFontScale.getState().hydrate();
    expect(useFontScale.getState().value).toBe(DEFAULT_FONT_SCALE);
    expect(document.documentElement.style.fontSize).toBe('100%');
  });

  it('mirrors each set to localStorage for the pre-paint script in index.html', async () => {
    await useFontScale.getState().setValue(1.25);
    expect(localStorage.getItem(FONT_SCALE_MIRROR_KEY)).toBe('1.25');
  });

  it('rewrites the mirror on hydrate, so a stale copy heals on the next boot', async () => {
    localStorage.setItem(FONT_SCALE_MIRROR_KEY, '1.25');
    await db.settings.put({ key: FONT_SCALE_KEY, value: 0.875 });
    await useFontScale.getState().hydrate();
    expect(localStorage.getItem(FONT_SCALE_MIRROR_KEY)).toBe('0.875');
  });

  it('still applies the scale when localStorage throws', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      await useFontScale.getState().setValue(1.125);
      expect(document.documentElement.style.fontSize).toBe('112.5%');
    } finally {
      setItem.mockRestore();
    }
  });
});
