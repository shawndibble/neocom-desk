import type { ReactNode } from 'react';

/** Transient "it worked" note, under the action that produced it. `action`, when given, is an extra control beside it (e.g. Undo). */
export function PlanConfirmation({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-success">
      {message}
      {action}
    </p>
  );
}
