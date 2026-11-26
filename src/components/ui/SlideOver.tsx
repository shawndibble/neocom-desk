import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cx } from '@/lib/cx';
import { useFadeOnChange } from '@/lib/useFadeOnChange';
import { useIsPhone } from '@/lib/useIsPhone';
import { useOverlayHistory } from '@/lib/useOverlayHistory';
import { IconButton } from './IconButton';
import { Close } from './icons';
import { RowTappableContext } from './tooltipHold';

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  subtitle?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  flush?: boolean;
  side?: 'left' | 'right';
  className?: string;
  wide?: boolean;
  maxWidthClassName?: string;
  closeOnBack?: boolean;
  returnFocusFallback?: () => HTMLElement | null;
  contentKey?: string | number;
}

const SIDE_CLASS = {
  left: 'left-0 border-r motion-slide-left',
  right: 'right-0 border-l motion-slide-right',
} as const;

export function SlideOver({
  open,
  onClose,
  title,
  children,
  subtitle,
  initialFocusRef,
  flush = false,
  side = 'right',
  className,
  wide = false,
  maxWidthClassName,
  closeOnBack = true,
  returnFocusFallback,
  contentKey,
}: SlideOverProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  useOverlayHistory(open, onClose, closeOnBack);
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);
  return (
    <DialogPrimitive.Root
      open={open}
      modal={isPhone}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (document.querySelector('dialog[open]')) event.preventDefault();
          }}
          aria-describedby={undefined}
          data-slide-over={side}
          tabIndex={-1}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const target = initialFocusRef?.current ?? (event.currentTarget as HTMLElement);
            target.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            const kept = opener.current;
            opener.current = null;
            const target = kept?.isConnected ? kept : (returnFocusFallback?.() ?? null);
            if (!target?.isConnected) return;
            event.preventDefault();
            target.focus({ preventScroll: true });
          }}
          className={cx(
            'outline-none fixed top-0 bottom-0 z-40 flex w-full flex-col pb-[env(safe-area-inset-bottom)] border-line-bright bg-panel shadow-lg shadow-black/50',
            wide ? 'max-w-5xl' : (maxWidthClassName ?? 'max-w-[25rem]'),
            SIDE_CLASS[side],
            className
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-sm font-semibold">
                {title}
              </DialogPrimitive.Title>
              {subtitle && <p className="text-xs text-text-dim">{subtitle}</p>}
            </div>
            <IconButton icon={<Close />} label={t('common.close')} onClick={onClose} />
          </div>
          <SlideOverBody flush={flush} contentKey={contentKey}>
            {children}
          </SlideOverBody>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SlideOverBody({
  flush,
  contentKey,
  children,
}: {
  flush: boolean;
  contentKey: string | number | undefined;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFadeOnChange(ref, String(contentKey ?? ''));
  return (
    <div ref={ref} className={cx('min-h-0 flex-1 overflow-y-auto', !flush && 'p-3')}>
      <RowTappableContext.Provider value={false}>{children}</RowTappableContext.Provider>
    </div>
  );
}
