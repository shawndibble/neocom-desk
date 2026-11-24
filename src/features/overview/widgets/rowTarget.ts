/**
 * The class of a widget table row's first-cell target (a link, the modal opener, the
 * turn-in opener): its `after` box stretches over the whole row, so the row is the target
 * (DESIGN §6c "Widget rows"), and the focus ring is drawn on that box.
 */
export const ROW_TARGET_CLASS =
  'min-w-0 truncate outline-none after:absolute after:inset-0 after:content-[""] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent';
