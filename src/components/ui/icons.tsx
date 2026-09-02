/**
 * The app's icon vocabulary.
 *
 * One pack, one weight, imported per icon. Phosphor's `light` weight is the
 * only shortlisted set with a genuinely 1px-native face rather than a thinned
 * 2px one, which is what DESIGN.md §3's hairline rule needs — a 2px default
 * reads as a heavier line than every border on the page. Sizes follow the type
 * scale in `rem`, not `px`, so they grow with Settings' text-size control
 * alongside the text they label.
 *
 * Import icons FROM HERE, never from `@phosphor-icons/react` directly: this
 * module is what keeps the weight and the sizing consistent, and what makes
 * swapping the pack a single-file change. Add a re-export here when you need a
 * glyph the app doesn't have yet.
 */

import {
  ArrowClockwise,
  ArrowsLeftRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUpDown,
  Check,
  DotsThreeVertical,
  DownloadSimple,
  MagnifyingGlass,
  Package,
  Star,
  UsersThree,
  Warning,
  X,
  type Icon as PhosphorIcon,
  type IconProps,
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';

export type { IconProps };

/**
 * Every icon in the app renders at this weight. Exported so a one-off that
 * needs a Phosphor glyph not yet re-exported below can still match.
 */
export const ICON_WEIGHT = 'light' as const;

/** Sized in `rem` so icons scale with the root font-size like their labels do (DESIGN.md §2). */
export const ICON_SIZE = {
  /** 1rem — inline with `text-sm` body copy and inside dense rows. */
  sm: '1rem',
  /** 1.25rem — the default for toolbar and row controls. */
  md: '1.25rem',
  /** 1.5rem — navigation affordances that carry a whole row, e.g. breadcrumb back. */
  lg: '1.5rem',
} as const;

function withWeight(Glyph: PhosphorIcon): ComponentType<IconProps> {
  function Wrapped({ size = ICON_SIZE.md, weight = ICON_WEIGHT, ...rest }: IconProps) {
    return <Glyph size={size} weight={weight} {...rest} />;
  }
  Wrapped.displayName = `Icon(${Glyph.displayName ?? 'Glyph'})`;
  return Wrapped;
}

/** Steps back up one level in the Assets drill-down; also the generic "go back". */
export const Back = withWeight(CaretLeft);
/** A row you can descend into. */
export const Descend = withWeight(CaretRight);
/** A disclosure that is currently open. */
export const Expanded = withWeight(CaretDown);
/** Sort control. */
export const Sort = withWeight(CaretUpDown);
/** Re-fetch from ESI. */
export const Refresh = withWeight(ArrowClockwise);
/** Download the current view as CSV. */
export const Download = withWeight(DownloadSimple);
/** Search / filter. */
export const Search = withWeight(MagnifyingGlass);
/** Multi-select mode. */
export const Select = withWeight(Check);
/** Pin — filled when pinned, outline when not (pass `weight="fill"`). */
export const Pin = withWeight(Star);
/** Search across every character on the account. */
export const AllCharacters = withWeight(UsersThree);
/** A container or a ship's bay — anything holding other assets. */
export const Container = withWeight(Package);
/** Route preference (shortest vs safest). */
export const Route = withWeight(ArrowsLeftRight);
/** Something is incomplete or unresolved — pairs with `warning` text, never used alone. */
export const Warn = withWeight(Warning);
/** Clear a field, dismiss a panel. */
export const Close = withWeight(X);
/** Overflow menu. */
export const More = withWeight(DotsThreeVertical);
