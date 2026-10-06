import { createContext } from 'react';

/**
 * Whether a touch-and-hold on a `Tooltip` trigger reveals its bubble.
 * A row menu (`RowActionsMenu`) sets it false: Radix opens a context menu on a
 * touch-and-hold, so inside a row a hold is the menu's and never a tooltip —
 * everything a bubble says there must be reachable in the menu or the row's
 * detail. Everywhere else it is true: a hold on an icon button or a chip
 * shows its label.
 */
export const TooltipHoldContext = createContext(true);

/**
 * Whether the enclosing row opens something when tapped. `DataTable` sets it
 * for a clickable (or expandable) row; `IskAmount` then leaves the tap to the
 * row — the exact figure is in the row's detail — instead of claiming it to
 * toggle its own bubble. Hover and keyboard focus still show the bubble.
 */
export const RowTappableContext = createContext(false);

/**
 * True inside an `IskFigureGroup`: the figure joins the group's roving tabindex
 * (one tab stop for the whole group) instead of being its own tab stop.
 */
export const IskFigureGroupContext = createContext(false);

/** Touch-and-hold duration, matching Radix's context menu long-press, so the two can never disagree. */
export const HOLD_MS = 700;
/** Finger drift that turns a hold into a drag or scroll. */
export const HOLD_SLOP_PX = 10;
