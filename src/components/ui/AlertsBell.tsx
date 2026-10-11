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

/**
 * The alerts panel's way in, in every page header (scope decision
 * `20261011-064822-overview-is-a-widget-grid-the-pilot-builds`). Always drawn:
 * dim at zero on a desktop so the corner never shifts when an alert arrives, an accent
 * count badge while alerts wait, a red one while a danger Alert is among them.
 * On a phone it draws nothing at zero (a header laid out with other icons stays
 * clear) unless `showWhenEmpty` (the Overview's header, which has room for it).
 *
 * The panel is injected through `AlertsPanelContext` (this layer cannot import
 * the notification feature): a popover anchored to the bell on a desktop, a
 * full-height sheet on a phone. Esc, outside click and focus return come from
 * those primitives.
 */
export function AlertsBell({ showWhenEmpty }: { showWhenEmpty?: boolean }) {
  const { t } = useTranslation();
  const { count, danger } = useContext(UnreadAlertsContext);
  const { open, setOpen, renderPanel } = useContext(AlertsPanelContext);
  const phone = useIsPhone();

  // Hooks above; after this a quiet phone header has no bell at all (an open panel keeps it).
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
                'absolute -top-1 -right-1 min-w-4 rounded-xs px-1 text-center text-[0.625rem] leading-4 font-semibold tabular-nums',
                danger ? 'bg-danger text-text' : 'bg-accent text-bg'
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
