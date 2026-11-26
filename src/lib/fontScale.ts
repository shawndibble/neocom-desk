import { writeLocal } from './safeLocalStorage';
import { createLocalSetting } from './useLocalSetting';

export const FONT_SCALE_KEY = 'fontScale';

export const FONT_SCALE_MIRROR_KEY = 'neocom:font-scale';

export const FONT_SCALE_STEPS = [0.875, 1, 1.125, 1.25] as const;
export type FontScale = (typeof FONT_SCALE_STEPS)[number];

export const DEFAULT_FONT_SCALE: FontScale = 1;

function isFontScale(value: number): value is FontScale {
  return (FONT_SCALE_STEPS as readonly number[]).includes(value);
}

function applyFontScale(scale: FontScale): void {
  document.documentElement.style.fontSize = `${scale * 100}%`;
  writeLocal(FONT_SCALE_MIRROR_KEY, String(scale));
}

export function rootFontScale(): number {
  if (typeof document === 'undefined') return 1;
  const inline = document.documentElement.style.fontSize;
  if (inline.endsWith('%')) {
    const pct = parseFloat(inline);
    if (Number.isFinite(pct) && pct > 0) return pct / 100;
  }
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(px) && px > 0 ? px / 16 : 1;
}

export function scalePx(px: number): number {
  return Math.round(px * rootFontScale());
}

export const useFontScale = createLocalSetting<FontScale>({
  key: FONT_SCALE_KEY,
  defaultValue: DEFAULT_FONT_SCALE,
  parse: (raw) => (typeof raw === 'number' && isFontScale(raw) ? raw : null),
  onApply: applyFontScale,
});
