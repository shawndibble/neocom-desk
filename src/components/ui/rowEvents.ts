import type { MouseEvent } from 'react';

/**
 * What counts as a control of its own inside a clickable row: anything the
 * user can click to do something other than open the row. A bare
 * `tabIndex={0}` isn't enough — an ISK figure is focusable only so the
 * keyboard can reach its hover tooltip, and a click on it still opens the
 * row. A tap-to-open tooltip trigger marks itself with `data-row-control`.
 */
const ROW_CONTROL_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[data-row-control]',
].join(',');

/**
 * Whether a click on a clickable row is the row's own — not one that landed on
 * a control inside it (a star button, a bulk-select checkbox, a tooltip
 * trigger), and not one bubbled up through React from something portaled out
 * of it (a menu or modal opened from the row). Keyboard activation of such a
 * control fires a click too, so this is also what keeps Enter/Space on it
 * from opening the row. Pages need no `stopPropagation` workaround of their
 * own.
 */
export function isRowOwnEvent(event: MouseEvent<HTMLElement>): boolean {
  const row = event.currentTarget;
  const target = event.target;
  if (!(target instanceof Element) || !row.contains(target)) return false;
  const control = target.closest(ROW_CONTROL_SELECTOR);
  return control === null || control === row || !row.contains(control);
}
