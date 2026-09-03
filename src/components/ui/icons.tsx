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
  ArrowCounterClockwise,
  ArrowDown,
  ArrowUp,
  ArrowsDownUp,
  ArrowsLeftRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUpDown,
  ChartLineUp,
  Check,
  ClipboardText,
  Copy,
  DotsThreeVertical,
  DownloadSimple,
  EnvelopeSimple,
  Export as ExportIcon,
  Factory,
  Flag,
  GraduationCap,
  Hammer,
  MagnifyingGlass,
  Package,
  PencilSimple,
  Planet,
  Plus,
  Queue,
  ShoppingCart,
  Sliders,
  Stack,
  Star,
  Target,
  UsersThree,
  Wallet as WalletGlyph,
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
/** A column that can be sorted but currently isn't. */
export const Sort = withWeight(CaretUpDown);
/** Ascending: a sorted-ascending column, or "move this row up". */
export const Ascending = withWeight(ArrowUp);
/** Descending: a sorted-descending column, or "move this row down". */
export const Descending = withWeight(ArrowDown);
/** Re-fetch from ESI. */
export const Refresh = withWeight(ArrowClockwise);
/** Puts a field back to the value it would have had if nobody had touched it. Deliberately not `Refresh`, which fetches new data — these sit two controls apart on the Industry panel. */
export const Revert = withWeight(ArrowCounterClockwise);
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
/** Edit a name in place — the rename affordance on a saved-plan row. */
export const Rename = withWeight(PencilSimple);
/** Copy a saved plan to a new one. */
export const Duplicate = withWeight(Copy);
/** Overflow menu. */
export const More = withWeight(DotsThreeVertical);
/** Send the plan queue to the clipboard or a CSV download (#224 icon-only toolbar). */
export const Export = withWeight(ExportIcon);
/** Pull the character's live skill queue into the plan (#224 icon-only toolbar). */
export const ImportQueue = withWeight(Queue);
/** Parse a pasted skill queue into the plan (#224 icon-only toolbar). */
export const ImportClipboard = withWeight(ClipboardText);
/** Tune remaps for the lowest total training time (#224 icon-only toolbar). */
export const OptimizeRemaps = withWeight(Sliders);
/** Drop a remap marker at the current end of the queue (#224 icon-only toolbar). */
export const AddMarker = withWeight(Flag);
/** Tune remaps against the plan's existing markers (#224 icon-only toolbar). */
export const OptimizeAtMarkers = withWeight(Target);
/** Reorder the queue by priority/attribute pair (#224 icon-only toolbar). */
export const SuggestReorder = withWeight(ArrowsDownUp);
/** A build plan material this character is better off manufacturing or growing than buying. */
export const Build = withWeight(Hammer);
/** The same verdict the other way: buying the material beats producing it. */
export const Buy = withWeight(ShoppingCart);
/** Promote a derived prereq row into a real Skill Plan entry (CONTEXT.md "Prereq Promotion"). */
export const AddToPlan = withWeight(Plus);

// The Login page's feature list (src/routes/Login.tsx) is the one caller for
// the seven below — grouped here so a reader can see they're a set.
/** Skill training and progression. */
export const Skills = withWeight(GraduationCap);
/** Manufacturing build plans. */
export const Industry = withWeight(Factory);
/** Live order books. */
export const Market = withWeight(ChartLineUp);
/** Balance and open orders. */
export const Wallet = withWeight(WalletGlyph);
/** Colonies and extraction timers. */
export const Planetary = withWeight(Planet);
/** Mail, calendar and contacts, grouped as one row. */
export const Social = withWeight(EnvelopeSimple);
/** Jump clones and implants. */
export const Clones = withWeight(Stack);
