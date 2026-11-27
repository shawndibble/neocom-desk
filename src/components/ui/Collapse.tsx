import { useEffect, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

export const COLLAPSE_MS = 220;

type Phase = 'closed' | 'opening' | 'open' | 'closing';

interface CollapseProps {
  open: boolean;
  id?: string;
  children: ReactNode;
  className?: string;
  /** @summary Slide open only; shutting unmounts the body at once, as a plain expander does. */
  closeInstantly?: boolean;
}

export function Collapse({ open, id, children, className, closeInstantly }: CollapseProps) {
  const [phase, setPhase] = useState<Phase>(open ? 'open' : 'closed');
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setPhase(open ? 'opening' : closeInstantly ? 'closed' : 'closing');
  }

  useEffect(() => {
    if (phase !== 'opening' && phase !== 'closing') return;
    const timer = setTimeout(() => setPhase(phase === 'opening' ? 'open' : 'closed'), COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const expanded = phase === 'opening' || phase === 'open';
  return (
    <div
      id={id}
      inert={!open}
      data-state={open ? 'open' : 'closed'}
      className={cx(
        'grid motion-safe:transition-[grid-template-rows] motion-safe:ease-(--motion-ease-out)',
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
      style={{ transitionDuration: `${COLLAPSE_MS}ms` }}
    >
      <div className={cx('min-h-0 min-w-0', phase !== 'open' && 'overflow-hidden')}>
        {phase !== 'closed' && <div className={className}>{children}</div>}
      </div>
    </div>
  );
}
