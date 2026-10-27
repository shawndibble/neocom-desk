import type { MouseEvent } from 'react';

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
