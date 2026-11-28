import type { ReactNode } from 'react';

interface EmptyStateBase {
  /** @summary Already-translated headline saying what is missing. */
  title: string;
  /** @summary ARIA role for the wrapper; `alert` for a failed read. */
  role?: 'alert';
  className?: string;
}

interface BlockEmptyStateProps extends EmptyStateBase {
  /** @summary One line on why it is empty or what to do next; may hold an inline link. */
  hint?: ReactNode;
  /** @summary Decorative glyph above the title. */
  icon?: ReactNode;
  /** @summary The control that resolves the empty state, e.g. a `Button`; two only when they start different things. */
  action?: ReactNode;
  variant?: 'block';
}

interface InlineEmptyStateProps extends EmptyStateBase {
  /** @summary `inline`: one dim 12px line for an empty sub-list or dialog list; the title only, so no hint, icon or action. */
  variant: 'inline';
}

/** @summary Centred title, hint and optional action for a view with nothing to show. */
export function EmptyState(props: BlockEmptyStateProps | InlineEmptyStateProps) {
  const { title, role, className = '' } = props;
  if (props.variant === 'inline') {
    return (
      <p role={role} className={`text-xs text-text-dim ${className}`}>
        {title}
      </p>
    );
  }
  const { hint, icon, action } = props;
  return (
    <div
      role={role}
      className={`flex flex-col items-center gap-2 px-4 py-10 text-center ${className}`}
    >
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
