/**
 * A row-end button with its disabled reason right under it (Set waypoint,
 * Assign Taxes): on the right of a wide row, left under the content on a
 * phone, and narrow enough that a long reason stays a short block under the
 * button. The row aligns items to the baseline, so the button stays level
 * with the text beside it whether or not the reason shows.
 */
export const blockedButtonClassName =
  'flex max-w-full flex-col items-start gap-1 sm:ml-auto sm:max-w-xs sm:items-end';
export const blockedReasonClassName = 'text-xs text-text-dim sm:text-right';
