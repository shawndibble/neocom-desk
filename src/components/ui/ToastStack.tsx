import { createPortal } from 'react-dom';
import { Toast } from './Toast';
import { usePortalContainer } from './portalContainer';

export interface ToastStackItem {
  id: string;
  message: string;
}

interface ToastStackProps {
  /** Oldest first; the newest sits at the bottom, older ones rise out of its way. */
  items: readonly ToastStackItem[];
  undoLabel: string;
  onUndo: (id: string) => void;
  /** An entry's clock ran out, Escape or its close button was used, or the route changed. */
  onClose: (id: string) => void;
}

/**
 * Several Undo toasts at once, for an action that can repeat before the first
 * Undo expires (delete a plan, then another). Each entry is a plain `Toast`
 * with its own Undo and its own 8s clock; the stack only places them. The
 * caller caps the list (`useDeferredCommits` pushes the oldest out at 3).
 * Same placement and portalling as a single `Toast`.
 */
export function ToastStack({ items, undoLabel, onUndo, onClose }: ToastStackProps) {
  const portalContainer = usePortalContainer();
  if (items.length === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed bottom-32 left-1/2 z-40 flex w-[95vw] -translate-x-1/2 flex-col items-center gap-2 md:bottom-16 md:w-auto md:max-w-[calc(100vw-2rem)]">
      {items.map((item) => (
        <Toast
          key={item.id}
          stacked
          message={item.message}
          undo={{ label: undoLabel, onUndo: () => onUndo(item.id) }}
          onClose={() => onClose(item.id)}
        />
      ))}
    </div>,
    portalContainer ?? document.body
  );
}
