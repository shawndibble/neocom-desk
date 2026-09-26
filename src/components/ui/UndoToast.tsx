import type { ReactNode } from 'react';
import { inlineLinkClassName } from './controlStyles';

export interface UndoToastProps {
  message: ReactNode;
  undoLabel: string;
  onUndo: () => void;
}

/** Fixed-position "did something · Undo" confirmation, floating above the tab bar. */
export function UndoToast({ message, undoLabel, onUndo }: UndoToastProps) {
  return (
    <div
      role="status"
      className="bg-panel border-line text-text fixed bottom-32 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xs border px-4 py-2 text-sm shadow-lg md:bottom-16"
    >
      <span>{message}</span>
      <button type="button" className={inlineLinkClassName} onClick={onUndo}>
        {undoLabel}
      </button>
    </div>
  );
}
