export type StatChipTone = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export const STAT_CHIP_TONE_TEXT_CLASS: Record<StatChipTone, string> = {
  default: 'text-text',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};
