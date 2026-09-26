import type { ReactNode } from 'react';
import { inlineLinkClassName } from './controlStyles';

export interface ToastProps {
  message: ReactNode;
  /** Present together, or not at all — a toast with an undo action needs both. */
  undo?: { label: string; onUndo: () => void };
}

/** Fixed-position confirmation, floating above the tab bar. An "Undo" link when `undo` is given. */
export function Toast({ message, undo }: ToastProps) {
  return (
    <div
      role="status"
      className="bg-panel border-line text-text fixed bottom-32 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xs border px-4 py-2 text-sm shadow-lg md:bottom-16"
    >
      <span>{message}</span>
      {undo && (
        <button type="button" className={inlineLinkClassName} onClick={undo.onUndo}>
          {undo.label}
        </button>
      )}
    </div>
  );
}
