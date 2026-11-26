import type { MouseEvent } from 'react';

export const planHref = (planId: string): string => `/industry/plans/${planId}`;

export function onPlanLinkClick(open: () => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    open();
  };
}
