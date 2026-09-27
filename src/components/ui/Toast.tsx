import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { inlineLinkClassName } from './controlStyles';

export interface ToastProps {
  message: ReactNode;
  /** Present together, or not at all — a toast with an undo action needs both. */
  undo?: { label: string; onUndo: () => void };
}

/**
 * Fixed-position confirmation, floating above the tab bar. An "Undo" link
 * when `undo` is given.
 *
 * Portalled to `document.body` rather than rendered in place: `position:
 * fixed` is relative to the nearest ancestor with a `transform`/`filter`/
 * `backdrop-filter` (every `Panel` has one, for its `backdrop-blur-sm`), not
 * the viewport, in every browser that implements the spec. A caller inside a
 * long `Panel` — Hauling's Copy Multibuy button, at the very top of a list
 * that scrolls the page well past the viewport — pinned the toast off-screen
 * at the bottom of that panel instead of the bottom of the screen.
 */
export function Toast({ message, undo }: ToastProps) {
  return createPortal(
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
    </div>,
    document.body
  );
}
