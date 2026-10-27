/**
 * A submenu that opens in place on a phone. Below `md` the parent menu
 * already takes most of the width, so a panel beside it had no room on
 * either side — it squeezed to a sliver or ran over its parent. There the
 * `DropdownMenuSub*` / `ContextMenuSub*` wrappers use this instead: the
 * trigger expands its items under it, indented, in the same menu.
 *
 * Keyboard, matching Radix's side panel: Enter, Space or ArrowRight opens
 * (ArrowRight moves focus to the first item, as Radix does); ArrowLeft on
 * an item inside closes it and puts focus back on the trigger; Escape
 * closes the whole menu as ever.
 *
 * The query is a `max-width` one so that a browser without media queries
 * (jsdom) keeps the side panel. Internal — not re-exported from the barrel.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { InlineSubContext, type InlineSub } from './inlineSubmenuState';

/** A `…Sub` root in place: holds its open state for its trigger and content. */
export function InlineSubRoot({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const [focusFirst, setFocusFirst] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const setOpen = useCallback((next: boolean) => setOpenState(next), []);
  const value = useMemo(
    () => ({ open, setOpen, focusFirst, setFocusFirst, id, triggerRef }),
    [open, setOpen, focusFirst, id]
  );
  return <InlineSubContext.Provider value={value}>{children}</InlineSubContext.Provider>;
}

/** A side-panel `…Sub` root: nothing under it reads an outer in-place state. */
export function SidePanelSubRoot({ children }: { children: ReactNode }) {
  return <InlineSubContext.Provider value={null}>{children}</InlineSubContext.Provider>;
}

/** The caret an in-place trigger ends with, turned down while open. */
export function InlineCaret({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx('text-text-dim transition-transform', open && 'rotate-90')}
    >
      ›
    </span>
  );
}

/** An in-place submenu's items, under its trigger. */
export function InlineSubContent({
  inline,
  className,
  children,
}: {
  inline: InlineSub;
  className?: string;
  children: ReactNode;
}) {
  const groupRef = useRef<HTMLDivElement | null>(null);
  const { open, focusFirst, setFocusFirst, setOpen, triggerRef } = inline;
  useEffect(() => {
    if (!open || !focusFirst) return;
    setFocusFirst(false);
    groupRef.current
      ?.querySelector<HTMLElement>('[role^="menuitem"]:not([data-disabled])')
      ?.focus();
  }, [open, focusFirst, setFocusFirst]);
  if (!open) return null;
  return (
    // Its own items only: a submenu nested in it takes its own state.
    <SidePanelSubRoot>
      <div
        ref={groupRef}
        id={inline.id}
        role="group"
        className={cx('ml-2 border-l border-line pl-1', className)}
        onKeyDown={(event) => {
          // Back to the parent list, as a side panel's ArrowLeft does.
          if (event.key !== 'ArrowLeft') return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }}
      >
        {children}
      </div>
    </SidePanelSubRoot>
  );
}
