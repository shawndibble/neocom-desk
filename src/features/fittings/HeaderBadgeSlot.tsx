/**
 * The empty place a Fitting header badge holds while its data loads (issue
 * #2255): the size of a default `IconButton`, so the badge landing doesn't
 * widen the badge group and push the header's action group onto another row.
 * Empty space, not a skeleton (DESIGN.md: prefer a spinner to a skeleton) —
 * `aria-hidden` and unfocusable, like `Spinner`'s `delayMs` placeholder.
 */
export function HeaderBadgeSlot() {
  return <span aria-hidden="true" className="inline-flex size-11 shrink-0 md:size-9" />;
}
