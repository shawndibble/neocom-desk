import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { AlertsPanelContext } from './alertsPanelContext';
import { IconButton } from './IconButton';
import { NavAlerts } from './icons';
import { Modal } from './Modal';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { UnreadAlertsContext } from './unreadAlertsContext';

export function AlertsBell({ showWhenEmpty }: { showWhenEmpty?: boolean }) {
  const { t } = useTranslation();
  const { count, danger } = useContext(UnreadAlertsContext);
  const { open, setOpen, renderPanel } = useContext(AlertsPanelContext);
  const phone = useIsPhone();

  if (count <= 0 && !open && !(showWhenEmpty ?? !phone)) return null;

  const label =
    count <= 0
      ? t('alerts.panel.bellNone')
      : danger
        ? t('alerts.panel.bellDanger', { count })
        : t('nav.alertsWithCount', { count });

  const button = (
    <IconButton
      label={label}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cx('relative', count <= 0 && 'opacity-70')}
      onClick={phone ? () => setOpen(!open) : undefined}
      icon={
        <>
          <NavAlerts aria-hidden="true" />
          {count > 0 && (
            <span
              aria-hidden="true"
              className={cx(
                'absolute -top-1 -right-1 min-w-4 rounded-xs px-1 text-center text-[0.6875rem] leading-4 font-semibold text-bg tabular-nums',
                danger ? 'bg-danger' : 'bg-accent'
              )}
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </>
      }
    />
  );

  if (renderPanel === null) return button;

  if (phone) {
    return (
      <>
        {button}
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={t('alerts.panel.title')}
          placement="sheet-full"
        >
          {renderPanel({ variant: 'sheet', onClose: () => setOpen(false) })}
        </Modal>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(40rem,var(--radix-popper-available-height))] w-[min(26rem,calc(100vw-1rem))] overflow-y-auto p-0"
        aria-label={t('alerts.panel.title')}
      >
        {renderPanel({ variant: 'popover', onClose: () => setOpen(false) })}
      </PopoverContent>
    </Popover>
  );
}
