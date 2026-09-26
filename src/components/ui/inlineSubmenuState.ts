/** The state and hooks behind `inlineSubmenu.tsx` — see its header. Internal. */
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { cx } from '@/lib/cx';

const NARROW_MENU_QUERY = '(max-width: 47.99rem)';

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

/** Whether submenus open in place (a phone-width viewport). */
export function useInlineSubmenus(): boolean {
  return useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
}

export interface InlineSub {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Focus the first item once it renders (an ArrowRight open). */
  focusFirst: boolean;
  setFocusFirst: (focus: boolean) => void;
  id: string;
  triggerRef: RefObject<HTMLDivElement | null>;
}

export const InlineSubContext = createContext<InlineSub | null>(null);

/** The in-place state of the nearest submenu; null for a side-panel one. */
export function useInlineSub(): InlineSub | null {
  return useContext(InlineSubContext);
}

/** The props an item needs to be an in-place submenu's trigger. */
export function inlineTriggerProps(inline: InlineSub, className?: string) {
  return {
    ref: inline.triggerRef,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': inline.open,
    'aria-controls': inline.open ? inline.id : undefined,
    className: cx('justify-between', inline.open && 'bg-panel-2', className),
    // Opens (or closes) in place and keeps the menu up, rather than selecting.
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
        // Closes this one only, not the submenu the trigger itself sits in.
        event.preventDefault();
        event.stopPropagation();
        inline.setOpen(false);
      }
    },
  };
}
