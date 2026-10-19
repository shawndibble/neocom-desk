import type { FontScale } from '@/lib/fontScale';

export const FONT_SCALE_LABEL_KEYS = {
  0.875: 'settings.fontScaleSmall',
  1: 'settings.fontScaleDefault',
  1.125: 'settings.fontScaleLarge',
  1.25: 'settings.fontScaleExtraLarge',
} as const satisfies Record<FontScale, string>;
