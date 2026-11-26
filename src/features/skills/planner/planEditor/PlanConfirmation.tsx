import type { ReactNode } from 'react';

export function PlanConfirmation({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-success">
      {message}
      {action}
    </p>
  );
}
