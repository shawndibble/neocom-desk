import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@/db';
import { useFontScale, FONT_SCALE_KEY, FONT_SCALE_STEPS, DEFAULT_FONT_SCALE } from './fontScale';

beforeEach(async () => {
  await db.settings.clear();
  useFontScale.setState({ value: DEFAULT_FONT_SCALE, hydrated: false });
  document.documentElement.style.fontSize = '';
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
});
