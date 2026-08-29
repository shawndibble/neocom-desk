import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

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
