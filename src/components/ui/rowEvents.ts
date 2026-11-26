import type { MouseEvent } from 'react';

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
  '[role="tab"]',
  '[role="combobox"]',
  '[data-row-control]',
].join(',');

export function isRowOwnEvent(event: MouseEvent<HTMLElement>): boolean {
  const row = event.currentTarget;
  const target = event.target;
  if (!(target instanceof Element) || !row.contains(target)) return false;
  const control = target.closest(ROW_CONTROL_SELECTOR);
  return control === null || control === row || !row.contains(control);
}
