/**
 * The Phosphor weights the app is allowed to render.
 *
 * Kept apart from `icons.tsx` (no React, no JSX, relative imports only) so
 * `vite.config.ts` can load it too: `phosphorWeightsPlugin` strips every other
 * weight out of Phosphor's per-icon path tables at build time. Each icon ships
 * all six weights and the app draws two, so the other four were ~150 KB of
 * the `ui` chunk nobody could ever see.
 *
 * Adding a weight here is the whole change needed to use it — the plugin and
 * the guard test (`iconWeights.test.ts`) both read this list.
 */

/** Every icon in the app renders at this weight by default. */
export const ICON_WEIGHT = 'light' as const;

/** `light` everywhere; `fill` for the pinned state of `Icon.Pin`. */
export const ALLOWED_ICON_WEIGHTS = [ICON_WEIGHT, 'fill'] as const;

export type AllowedIconWeight = (typeof ALLOWED_ICON_WEIGHTS)[number];

/** All six weights Phosphor ships per icon. */
export const PHOSPHOR_WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'] as const;
