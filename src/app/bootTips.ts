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

export const BOOT_TIP_DELAY_MS = 400;
export const BOOT_TIP_ROTATE_MS = 5000;

function pick(random: () => number): BootTipKey {
  return BOOT_TIP_KEYS[
    Math.min(Math.floor(random() * BOOT_TIP_KEYS.length), BOOT_TIP_KEYS.length - 1)
  ];
}

export function pickBootTip(random: () => number = Math.random): BootTipKey {
  return pick(random);
}

export function nextBootTip(current: BootTipKey, random: () => number = Math.random): BootTipKey {
  const others = BOOT_TIP_KEYS.filter((key) => key !== current);
  return others[Math.min(Math.floor(random() * others.length), others.length - 1)];
}

let pageLoadTip: BootTipKey | undefined;

export function getBootTip(): BootTipKey {
  pageLoadTip ??= pickBootTip();
  return pageLoadTip;
}

export function resetBootTip(): void {
  pageLoadTip = undefined;
}
