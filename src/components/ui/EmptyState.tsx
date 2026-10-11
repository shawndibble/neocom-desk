import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** @summary Already-translated headline saying what is missing. */
  title: string;
  /** @summary One line on why it is empty or what to do next. */
  hint?: string;
  /** @summary Decorative glyph above the title. */
  icon?: ReactNode;
  /** @summary The one control that resolves the empty state, e.g. a `Button`. */
  action?: ReactNode;
  className?: string;
}

/**
 * Shown instead of a bare empty table or list (docs/DESIGN.md §4).
 *
 * @summary Centred title, hint and optional action for a view with nothing to show.
 */
export function EmptyState({ title, hint, icon, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-2 px-4 py-10 text-center ${className}`}>
      {icon && (
        <div aria-hidden="true" className="text-text-faint">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold tracking-widest text-text-dim uppercase">{title}</p>
      {hint && <p className="max-w-sm text-xs text-text-dim">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
