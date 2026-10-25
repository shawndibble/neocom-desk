import { useEffect, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

/** Long enough to read as a slide, short enough not to wait on (DESIGN.md §6c "Edit setup"). */
export const COLLAPSE_MS = 220;

type Phase = 'closed' | 'opening' | 'open' | 'closing';

interface CollapseProps {
  /** Caller owns the state; the toggle carries `aria-expanded` and `aria-controls={id}`. */
  open: boolean;
  /** For the toggle's `aria-controls`. */
  id?: string;
  children: ReactNode;
  /** Spacing on the sliding body, e.g. a top border and padding. */
  className?: string;
}

/**
 * A region that slides open under its toggle and slides shut again, in place
 * (DESIGN.md §6c "Expands in place"). The body mounts on open and unmounts once
 * it has slid shut, so a heavy form costs nothing while hidden. Clipping only
 * applies while it moves: open, a dropdown inside may overhang the region.
 * Reduced motion snaps.
 */
export function Collapse({ open, id, children, className }: CollapseProps) {
  const [phase, setPhase] = useState<Phase>(open ? 'open' : 'closed');
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setPhase(open ? 'opening' : 'closing');
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
        'grid motion-safe:transition-[grid-template-rows] motion-safe:ease-out',
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
      style={{ transitionDuration: `${COLLAPSE_MS}ms` }}
    >
      <div className={cx('min-h-0', phase !== 'open' && 'overflow-hidden')}>
        {phase !== 'closed' && <div className={className}>{children}</div>}
      </div>
    </div>
  );
}
