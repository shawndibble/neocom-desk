import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Modal } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { summarize, type MailQueueItem } from '@/engine/corpTaxBook/mailQueue';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { MailQueuePanel, type MailQueueActions } from './MailQueuePanel';

interface ChipProps extends MailQueueActions {
  items: readonly MailQueueItem[];
  now: number;
  sendingId?: string;
  onClearSent?: () => void;
}

/**
 * The send queue's button in the page header, beside the alerts bell (D16): the send icon and
 * one count badge, which says the most urgent thing: mails that failed (warning), else mails
 * still to send (accent), else the sent total (success, when done). The words and the percent
 * live in its label and in the queue it opens: a popover on a desktop, a sheet on a phone.
 */
export function MailQueueChip(props: ChipProps) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const [sheetOpen, setSheetOpen] = useState(false);
  const s = summarize(props.items, props.now);
  const label =
    (s.done
      ? t('corpTaxBook.mailQueue.chip.ariaDone', { percent: s.percent })
      : t('corpTaxBook.mailQueue.chip.aria', { percent: s.percent })) +
    (s.failed > 0 ? `, ${t('corpTaxBook.mailQueue.chip.ariaFailed', { count: s.failed })}` : '');
  const panel = <MailQueuePanel {...props} />;
  const badge = s.failed > 0 ? s.failed : s.waiting > 0 ? s.waiting : s.sent;
  const tone =
    s.failed > 0
      ? 'bg-warning text-bg'
      : s.waiting > 0
        ? 'bg-accent text-bg'
        : 'bg-success text-bg';
  const button = (
    <IconButton
      label={label}
      aria-haspopup="dialog"
      className="relative"
      onClick={phone ? () => setSheetOpen(true) : undefined}
      icon={
        <>
          <Icon.MailSent aria-hidden="true" />
          <span
            aria-hidden="true"
            className={cx(
              'absolute -top-1 -right-1 min-w-4 rounded-xs px-1 text-center text-[0.6875rem] leading-4 font-semibold tabular-nums',
              tone
            )}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        </>
      }
    />
  );

  if (phone) {
    return (
      <>
        {button}
        <Modal
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={t('corpTaxBook.mailQueue.panelTitle')}
          placement="sheet-full"
        >
          {panel}
        </Modal>
      </>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={t('corpTaxBook.mailQueue.panelTitle')}
        className="w-[34rem] max-w-[90vw] space-y-3 p-3"
      >
        <p className="text-sm font-semibold">{t('corpTaxBook.mailQueue.panelTitle')}</p>
        <div className="max-h-[28rem] overflow-y-auto">{panel}</div>
      </PopoverContent>
    </Popover>
  );
}
