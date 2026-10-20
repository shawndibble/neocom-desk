/**
 * Tips under the boot screen's spinner. Explicit list, not derived from
 * en.json, so a typo fails `bootTips.test.ts` instead of rendering a raw key.
 * Only facts that hold offline, signed out or in, for features that always
 * exist.
 */
export const BOOT_TIP_KEYS = [
  'boot.tips.commandPalette',
  'boot.tips.shortcutsList',
  'boot.tips.pageKeys',
  'boot.tips.pasteFit',
  'boot.tips.pasteLocal',
  'boot.tips.pasteBack',
  'boot.tips.backup',
  'boot.tips.timeFormat',
  'boot.tips.textSize',
  'boot.tips.numberFormat',
  'boot.tips.selfUpdate',
] as const;

export type BootTipKey = (typeof BOOT_TIP_KEYS)[number];

/** A quick boot never shows a tip: it only appears once the wait is noticeable. */
export const BOOT_TIP_DELAY_MS = 400;
/** A screen instance that stays up this long moves on to another tip. */
export const BOOT_TIP_ROTATE_MS = 5000;

function pick(random: () => number): BootTipKey {
  return BOOT_TIP_KEYS[
    Math.min(Math.floor(random() * BOOT_TIP_KEYS.length), BOOT_TIP_KEYS.length - 1)
  ];
}

export function pickBootTip(random: () => number = Math.random): BootTipKey {
  return pick(random);
}

/** A tip different from `current`. */
export function nextBootTip(current: BootTipKey, random: () => number = Math.random): BootTipKey {
  const others = BOOT_TIP_KEYS.filter((key) => key !== current);
  return others[Math.min(Math.floor(random() * others.length), others.length - 1)];
}

let pageLoadTip: BootTipKey | undefined;

/**
 * The tip for this page load. Root, RequireCharacter and the Suspense fallback
 * each mount their own BootScreen in turn; one memoised pick keeps the tip
 * from changing under the pilot at every hand-off.
 */
export function getBootTip(): BootTipKey {
  pageLoadTip ??= pickBootTip();
  return pageLoadTip;
}

/** Test seam: forget the memoised pick. */
export function resetBootTip(): void {
  pageLoadTip = undefined;
}
