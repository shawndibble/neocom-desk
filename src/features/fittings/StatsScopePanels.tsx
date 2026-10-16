import type { ReactNode } from 'react';
import { Button, Modal, SlideOver } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useIsPhone } from '@/lib/useIsPhone';

/**
 * A stats-column trigger (Pilot, Situation): its dim label, the value the
 * panel behind it sets, and a trailing `CaretRight` — opens that panel
 * (DESIGN.md §6c). The value is what every figure below is worked out
 * under, so a non-default one reads here without opening anything.
 */
export function StatsScopeTrigger({
  label,
  open,
  onClick,
  children,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
  /** The current value, with any notes. */
  children: ReactNode;
}) {
  return (
    <Button
      size="sm"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
      className="max-w-full min-w-0 gap-2"
    >
      <span className="shrink-0 text-text-dim">{label}</span>
      <span className="min-w-0 truncate">{children}</span>
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
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const isPhone = useIsPhone();
  if (isPhone)
    return (
      <Modal open={open} onClose={onClose} title={title} placement="sheet-full">
        {/* Full-bleed rows, as in the column: undo the sheet body's padding. */}
        <div className="-m-3">
          {subtitle && (
            <p className="border-b border-line px-3 py-2 text-xs text-text-dim">{subtitle}</p>
          )}
          {children}
        </div>
      </Modal>
    );
  return (
    <SlideOver open={open} onClose={onClose} title={title} subtitle={subtitle} flush>
      {children}
    </SlideOver>
  );
}

/** A static small-caps label over a group of stats sections (Damage, Tank, Ship); never a toggle. */
export function StatsGroupLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="border-b border-line bg-panel-2/40 px-3 pt-3 pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
      {children}
    </h3>
  );
}
