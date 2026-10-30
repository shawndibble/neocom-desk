import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The selection and Apply bar. In the drawer it goes to the container's own
 * footer (`target`), below the scrolling list, so no row ever scrolls under it;
 * on its own (tests, a page with no footer) it sticks to the bottom of the list.
 */
export function ImproveFooter({
  target,
  children,
}: {
  target?: HTMLElement | null;
  children: ReactNode;
}) {
  const bar = <div className="space-y-2">{children}</div>;
  return target ? (
    createPortal(bar, target)
  ) : (
    <div className="bg-panel border-line sticky bottom-0 border-t pt-2">{bar}</div>
  );
}
