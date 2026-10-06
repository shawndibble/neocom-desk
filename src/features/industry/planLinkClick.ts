import type { KeyboardEvent, MouseEvent } from 'react';

/** Where a Build Plan lives; the real URL behind every plan-name link. */
export const planHref = (planId: string): string => `/industry/plans/${planId}`;

/**
 * Plain left click runs `open` (callers do more than navigate); modified
 * clicks fall through to the browser so middle/Ctrl+click opens a tab.
 */
export function onPlanLinkClick(open: () => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    open();
  };
}

/**
 * Space on a link that selects (a PI map tile or row): clicks it, as Enter
 * does, instead of scrolling the page. Returns whether it handled the key.
 */
export function clickOnSpace(e: KeyboardEvent<HTMLAnchorElement>): boolean {
  if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  e.preventDefault();
  e.currentTarget.click();
  return true;
}
