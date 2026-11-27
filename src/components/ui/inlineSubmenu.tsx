import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { InlineSubContext, type InlineSub } from './inlineSubmenuState';

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

export function SidePanelSubRoot({ children }: { children: ReactNode }) {
  return <InlineSubContext.Provider value={null}>{children}</InlineSubContext.Provider>;
}

export function InlineCaret({ open }: { open: boolean }) {
  return (
    <span aria-hidden="true" className={cx('text-text-dim', open && 'rotate-90')}>
      ›
    </span>
  );
}

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
    <SidePanelSubRoot>
      <div
        ref={groupRef}
        id={inline.id}
        role="group"
        className={cx('ml-2 border-l border-line pl-1', className)}
        onKeyDown={(event) => {
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
