/**
 * Device-local text-scale preference. Sets `<html>`'s font-size as a
 * percentage of the browser default, so every rem-sized value in the app —
 * text and the spacing/sizing scale `docs/DESIGN.md` builds on, both rem —
 * scales together. This is the one scale mechanism; other features that want
 * a density control (see the Overview density ticket) must read `useFontScale`
 * rather than define a second one.
 */
import { createLocalSetting } from './useLocalSetting';

export const FONT_SCALE_KEY = 'fontScale';

/**
 * localStorage mirror of the Dexie row, read synchronously by the inline
 * script in `index.html` so the stored scale is on `<html>` before the first
 * paint — Dexie is async, so the store's own hydrate always lands a frame or
 * more late, and every rem on the page would jump when it did. Only a mirror:
 * Dexie stays the source of truth, and `onApply` rewrites this on every
 * hydrate as well as every set, so a stale or cleared copy heals on the next
 * boot. The inline script carries its own copy of `FONT_SCALE_STEPS`
 * (`indexHtmlFontScale.test.ts` keeps the two in step).
 */
export const FONT_SCALE_MIRROR_KEY = 'neocom:font-scale';

/** 87.5%-125% of the browser default (16px) — the common OS accessibility steps. */
export const FONT_SCALE_STEPS = [0.875, 1, 1.125, 1.25] as const;
export type FontScale = (typeof FONT_SCALE_STEPS)[number];

export const DEFAULT_FONT_SCALE: FontScale = 1;

function isFontScale(value: number): value is FontScale {
  return (FONT_SCALE_STEPS as readonly number[]).includes(value);
}

function applyFontScale(scale: FontScale): void {
  document.documentElement.style.fontSize = `${scale * 100}%`;
  try {
    localStorage.setItem(FONT_SCALE_MIRROR_KEY, String(scale));
  } catch {
    // Blocked storage: the next cold load just applies the scale a beat
    // later, from Dexie, as it did before the mirror existed.
  }
}

export const useFontScale = createLocalSetting<FontScale>({
  key: FONT_SCALE_KEY,
  defaultValue: DEFAULT_FONT_SCALE,
  parse: (raw) => (typeof raw === 'number' && isFontScale(raw) ? raw : null),
  onApply: applyFontScale,
});
