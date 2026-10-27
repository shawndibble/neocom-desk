import type { KeyboardEvent } from 'react';

/**
 * Space on a link that selects: clicks it, as Enter does, instead of
 * scrolling. A held key clicks once, as on a button. Returns whether it
 * handled the key.
 */
export function clickOnSpace(e: KeyboardEvent<HTMLAnchorElement>): boolean {
  if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  e.preventDefault();
  if (!e.repeat) e.currentTarget.click();
  return true;
}
