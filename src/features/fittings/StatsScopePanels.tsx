import type { ReactNode, Ref } from 'react';
import { Button, Modal, SlideOver } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { STAT_EYEBROW } from './statKit';

/**
 * A stats-column trigger (Pilot, Situation): its dim label, the value the
 * panel behind it sets, and a trailing `CaretRight` — opens that panel
 * (DESIGN.md §6c). The value is what every figure below is worked out
 * under, so a non-default one reads here without opening anything.
 */
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
  /** The current value, with any notes; none shows the label alone. */
  children?: ReactNode;
}) {
  return (
    <Button
      ref={ref}
      size="sm"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
      // The `sm` height on a pointer, the 36px touch tier on a phone or touch screen.
      className={cx('max-w-full min-w-0 gap-2', tappableRowClassName)}
    >
      <span className="shrink-0 text-text-dim">{label}</span>
      {children && <span className="min-w-0 truncate">{children}</span>}
      <Icon.GoTo aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-faint" />
    </Button>
  );
}

/**
 * The panel a trigger opens: a right `SlideOver` over a page that stays
 * live, a full-height sheet on a phone (§6c drawer). Its body mounts only
 * while open, which is what keeps a closed panel's sections from working
 * anything out (the Abyssal weather's delta).
 */
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
  /** Its trigger: where focus goes on close when the opener is gone (the panel swapped form mid-open). */
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
        {/* Full-bleed rows, as in the column: undo the sheet body's padding (`Modal` has no `flush`). */}
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

/** A static small-caps label over a group of stats sections (Damage & Tank, Ship); never a toggle. */
export function StatsGroupLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className={cx('border-b border-line bg-panel-2/40 px-3 pt-3 pb-1', STAT_EYEBROW)}>
      {children}
    </h3>
  );
}
