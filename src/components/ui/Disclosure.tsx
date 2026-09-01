import type { ReactNode } from 'react';

interface DisclosureProps {
  /** Always-visible label, left of the chevron toggle. */
  label: ReactNode;
  /** Always-visible value, right-aligned in the toggle row. */
  trailing?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Rendered only while expanded. */
  children: ReactNode;
  className?: string;
}

/**
 * ARIA-disclosure row: a button toggling `aria-expanded` with content
 * revealed beneath it. Caller owns the expanded state so it can be driven
 * externally (e.g. "expand all").
 */
export function Disclosure({
  label,
  trailing,
  expanded,
  onToggle,
  children,
  className = '',
}: DisclosureProps) {
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex min-h-8 w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          <span aria-hidden="true" className="w-3 shrink-0 text-text-faint">
            {expanded ? '▾' : '▸'}
          </span>
          {label}
        </span>
        {trailing !== undefined && (
          <span className="text-[0.6875rem] font-medium tabular-nums text-text">{trailing}</span>
        )}
      </button>
      {expanded && (
        <div className="divide-y divide-line border-t border-line bg-panel-2">{children}</div>
      )}
    </div>
  );
}
