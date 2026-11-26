import {
  createContext,
  useContext,
  useSyncExternalStore,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { cx } from '@/lib/cx';

const NARROW_MENU_QUERY = '(max-width: 47.99rem), (pointer: coarse)';

function subscribeNarrow(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(NARROW_MENU_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isNarrow(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(NARROW_MENU_QUERY).matches
  );
}

export function useInlineSubmenus(): boolean {
  return useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
}

export interface InlineSub {
  open: boolean;
  setOpen: (open: boolean) => void;
  focusFirst: boolean;
  setFocusFirst: (focus: boolean) => void;
  id: string;
  triggerRef: RefObject<HTMLDivElement | null>;
}

export const InlineSubContext = createContext<InlineSub | null>(null);

export function useInlineSub(): InlineSub | null {
  return useContext(InlineSubContext);
}

export function inlineTriggerProps(inline: InlineSub, className?: string) {
  return {
    ref: inline.triggerRef,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': inline.open,
    'aria-controls': inline.open ? inline.id : undefined,
    className: cx('justify-between', inline.open && 'bg-panel-2', className),
    onSelect: (event: Event) => {
      event.preventDefault();
      inline.setOpen(!inline.open);
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        inline.setFocusFirst(true);
        inline.setOpen(true);
      } else if (event.key === 'ArrowLeft' && inline.open) {
        event.preventDefault();
        event.stopPropagation();
        inline.setOpen(false);
      }
    },
  };
}
