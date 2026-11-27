import { eyebrowClassName } from './eyebrowClassName';
import { cx } from '@/lib/cx';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { grabberClassName } from './controlStyles';
import { PortalContainerProvider } from './portalContainer';
import { RowTappableContext } from './tooltipHold';
import { useOverlayHistory } from '@/lib/useOverlayHistory';
import { useIsPhone } from '@/lib/useIsPhone';
import { useSheetSwipe } from './useSheetSwipe';
import { ConfirmDialog } from './ConfirmDialog';

export type ModalPlacement =
  'center' | 'top' | 'sheet' | 'sheet-full' | 'medium' | 'detail' | 'wide' | 'page' | 'media';

interface ModalProps {
  open: boolean;
  id?: string;
  onClose: () => void;
  title: ReactNode;
  titleActions?: ReactNode;
  children: ReactNode;
  /**
   * @summary Action bar at the dialog's foot (Apply / Cancel, Copy), pinned below the scrolling body.
   * Never a sticky div inside `children`. On a sheet it takes the safe-area inset in place of the body.
   */
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  placement?: ModalPlacement;
  phonePlacement?: 'sheet' | 'center';
  closeOnBack?: boolean;
  dismissOnOutsidePress?: boolean;
  dirty?: boolean;
  returnFocusFallback?: () => HTMLElement | null;
}

const SHEET_ON_PHONE: ReadonlySet<ModalPlacement> = new Set(['center', 'medium', 'detail']);

const PLACEMENT_CLASSES: Record<ModalPlacement, { dialogClass: string; heightClass: string }> = {
  center: {
    dialogClass: 'motion-dialog m-auto w-full max-w-lg',
    heightClass: 'h-fit max-h-[85dvh]',
  },
  top: {
    dialogClass:
      'motion-fade mx-auto mt-[max(1rem,env(safe-area-inset-top))] mb-auto w-full max-w-lg md:mt-[12vh]',
    heightClass: 'h-fit max-h-[85dvh]',
  },
  sheet: {
    dialogClass: 'motion-sheet mx-auto mt-auto mb-0 w-full max-w-md rounded-b-none',
    heightClass: 'h-fit max-h-[85dvh]',
  },
  'sheet-full': {
    dialogClass: 'motion-sheet mx-auto mt-auto mb-0 w-full max-w-md rounded-b-none',
    heightClass: 'h-dvh max-h-dvh',
  },
  medium: {
    dialogClass: 'motion-dialog m-auto w-full max-w-3xl',
    heightClass: 'h-fit max-h-[85dvh]',
  },
  detail: {
    dialogClass: 'motion-dialog m-auto w-full max-w-[40rem]',
    heightClass: 'h-fit max-h-[85dvh]',
  },
  wide: {
    dialogClass: 'motion-dialog m-auto w-full max-w-[min(64rem,100vw)]',
    heightClass: 'h-fit max-h-[85dvh]',
  },
  page: {
    dialogClass:
      'motion-page m-0 w-full max-w-none max-md:rounded-none md:m-auto md:w-[min(72rem,95vw)]',
    heightClass: 'h-dvh max-h-dvh md:h-[90dvh] md:max-h-[90dvh]',
  },
  media: {
    dialogClass: 'motion-dialog m-auto w-fit max-w-[95vw]',
    heightClass: 'h-fit max-h-[95dvh]',
  },
};

export function Modal({
  open,
  id,
  onClose,
  title,
  titleActions,
  children,
  footer,
  placement: requestedPlacement = 'center',
  phonePlacement = 'sheet',
  initialFocusRef,
  closeOnBack = true,
  dismissOnOutsidePress = true,
  dirty = false,
  returnFocusFallback,
}: ModalProps) {
  const { t } = useTranslation();
  const [askingDiscard, setAskingDiscard] = useState(false);
  const requestClose = () => (dirty ? setAskingDiscard(true) : onClose());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressBeganInside = useRef(false);
  const isPhone = useIsPhone();
  const placement =
    isPhone && phonePlacement === 'sheet' && SHEET_ON_PHONE.has(requestedPlacement)
      ? 'sheet'
      : requestedPlacement;
  const isSheet = placement.startsWith('sheet');
  useOverlayHistory(open, requestClose, closeOnBack);
  const swipe = useSheetSwipe(dialogRef, requestClose, isSheet, open);
  const titleId = useId();
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const fallbackRef = useRef(returnFocusFallback);
  useEffect(() => {
    fallbackRef.current = returnFocusFallback;
  });
  const bodyRef = useCallback((element: HTMLDivElement | null) => {
    setPortalContainer(element);
    element?.setAttribute('autofocus', '');
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    const trigger = document.activeElement;
    if (!dialog.open) dialog.showModal();
    initialFocusRef?.current?.focus();

    return () => {
      if (dialog.open) dialog.close();
      const kept =
        trigger instanceof HTMLElement && trigger !== document.body && trigger.isConnected
          ? trigger
          : null;
      const fallback = kept ? null : (fallbackRef.current?.() ?? null);
      if (kept) kept.focus();
      else if (fallback?.isConnected) fallback.focus({ preventScroll: true });
      else if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [open, initialFocusRef]);

  const { dialogClass, heightClass } = PLACEMENT_CLASSES[placement];
  const hasFooter = footer != null && typeof footer !== 'boolean' && footer !== '';
  const bodyBottomClass =
    isSheet && !hasFooter ? ' scroll-pb-20 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]' : '';

  return (
    <>
      <dialog
        ref={dialogRef}
        id={id}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          requestClose();
        }}
        onPointerDown={(event) => {
          pressBeganInside.current = event.target !== dialogRef.current;
        }}
        onClick={(event) => {
          if (
            dismissOnOutsidePress &&
            event.target === dialogRef.current &&
            !pressBeganInside.current
          )
            requestClose();
          pressBeganInside.current = false;
        }}
        className={`fixed inset-0 overflow-hidden rounded-xs border border-line bg-panel p-0 text-left text-text shadow-lg shadow-black/50 backdrop:bg-black/60 ${heightClass} ${dialogClass}`}
      >
        {open && (
          <PortalContainerProvider value={portalContainer}>
            <div className={`flex ${heightClass} flex-col`}>
              <div {...swipe} className={isSheet ? 'touch-none bg-panel-2' : undefined}>
                {isSheet && (
                  <div aria-hidden="true" className="flex justify-center pt-2">
                    <span className={grabberClassName} />
                  </div>
                )}
                <header className="flex min-h-9 items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-1">
                  <h2 id={titleId} className={cx(eyebrowClassName, 'min-w-0 flex-1 truncate')}>
                    {title}
                  </h2>
                  {titleActions}
                  <IconButton
                    variant="plain"
                    icon={<Icon.Close />}
                    label={t('common.close')}
                    onClick={requestClose}
                  />
                </header>
              </div>
              <RowTappableContext.Provider value={false}>
                <div
                  ref={bodyRef}
                  tabIndex={-1}
                  className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 outline-none${bodyBottomClass}`}
                >
                  {children}
                </div>
                {hasFooter && (
                  <div
                    className={`shrink-0 border-t border-line bg-panel px-3 pt-2 ${isSheet ? 'pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]' : 'pb-2'}`}
                  >
                    {footer}
                  </div>
                )}
              </RowTappableContext.Provider>
            </div>
          </PortalContainerProvider>
        )}
      </dialog>
      {open && askingDiscard && (
        <ConfirmDialog
          open
          title={t('common.discardInputTitle')}
          body={t('common.discardInputBody')}
          actionLabel={t('common.discardInputConfirm')}
          cancelLabel={t('common.discardInputKeep')}
          closeOnBack={false}
          onConfirm={async () => {
            onClose();
          }}
          onClose={() => setAskingDiscard(false)}
        />
      )}
    </>
  );
}
