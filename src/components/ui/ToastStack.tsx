import { createPortal } from 'react-dom';
import { Toast } from './Toast';
import { usePortalContainer } from './portalContainer';

export interface ToastStackItem {
  id: string;
  message: string;
}

interface ToastStackProps {
  items: readonly ToastStackItem[];
  undoLabel: string;
  onUndo: (id: string) => void;
  onClose: (id: string) => void;
}

export function ToastStack({ items, undoLabel, onUndo, onClose }: ToastStackProps) {
  const portalContainer = usePortalContainer();
  if (items.length === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[95vw] -translate-x-1/2 flex-col items-center gap-2 md:bottom-16 md:w-auto md:max-w-[calc(100vw-2rem)]">
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
