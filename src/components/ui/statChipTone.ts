/**
 * `StatChipTone` and its tone->text-colour map, split out of `StatChip.tsx`
 * itself so a plain (non-chip) element that still needs to carry a tone's
 * meaning — e.g. a table cell — can import the map without also pulling in
 * (or duplicating) the chip component. Kept in its own module rather than
 * exported alongside `StatChip` because a component file exporting a plain
 * constant breaks Vite's fast-refresh boundary (react-refresh/only-export-
 * components).
 */
export type StatChipTone = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export const STAT_CHIP_TONE_TEXT_CLASS: Record<StatChipTone, string> = {
  default: 'text-text',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};
