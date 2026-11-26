import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
