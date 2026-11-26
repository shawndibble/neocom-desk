import type { ReactNode, Ref } from 'react';
import { Button, Modal, SlideOver } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { STAT_EYEBROW } from './statKit';

export function StatsScopeTrigger({
  ref,
  label,
  open,
  onClick,
  children,
}: {
  ref?: Ref<HTMLButtonElement>;
  label: string;
  open: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <Button
      ref={ref}
      size="sm"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
      className={cx('max-w-full min-w-0 gap-2', tappableRowClassName)}
    >
      <span className="shrink-0 text-text-dim">{label}</span>
      {children && <span className="min-w-0 truncate">{children}</span>}
      <Icon.GoTo aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-faint" />
    </Button>
  );
}

export function StatsScopePanel({
  open,
  onClose,
  title,
  subtitle,
  returnFocusFallback,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  returnFocusFallback: () => HTMLElement | null;
  children: ReactNode;
}) {
  const isPhone = useIsPhone();
  if (isPhone)
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={title}
        placement="sheet-full"
        returnFocusFallback={returnFocusFallback}
      >
        <div className="-m-3">
          {subtitle && (
            <p className="border-b border-line px-3 py-2 text-xs text-text-dim">{subtitle}</p>
          )}
          {children}
        </div>
      </Modal>
    );
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      flush
      returnFocusFallback={returnFocusFallback}
    >
      {children}
    </SlideOver>
  );
}

export function StatsGroupLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className={cx('border-b border-line bg-panel-2/40 px-3 pt-3 pb-1', STAT_EYEBROW)}>
      {children}
    </h3>
  );
}
