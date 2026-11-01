import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ProgressBar } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { summarize, type MailQueueItem } from '@/engine/corpTaxBook/mailQueue';
import { focusRingClassName } from '@/components/ui/controlStyles';
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
 * The top-bar progress chip (D16), on every page while a queue exists. §6c cue:
 * a popover (CaretDown inside a bordered chip) on a desktop; on a phone an
 * icon button whose corner badge shows the percent done (100% when done), with
 * a warning badge carrying the failure count, opening the queue as a sheet.
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

  if (phone) {
    return (
      <>
        <button
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
          className={cx(
            'relative inline-flex size-9 items-center justify-center rounded-xs border border-line hover:bg-panel-2',
            focusRingClassName
          )}
        >
          <Icon.MailSent size={Icon.ICON_SIZE.md} aria-hidden="true" />
          <span
            aria-hidden="true"
            className={cx(
              'absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border bg-bg px-1 text-[0.625rem] font-semibold tabular-nums',
              s.done && s.failed === 0
                ? 'border-success text-success'
                : 'border-line-bright text-text'
            )}
          >
            {s.percent}%
          </span>
          {s.failed > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1.5 -bottom-1.5 inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border border-warning bg-bg px-1 text-[0.625rem] font-semibold text-warning tabular-nums"
            >
              <Icon.Warn className="size-3" aria-hidden="true" />
              {s.failed}
            </span>
          )}
        </button>
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
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cx(
            'inline-flex h-8 items-center gap-2 rounded-xs border border-line px-2 text-xs whitespace-nowrap hover:bg-panel-2',
            focusRingClassName
          )}
        >
          <Icon.MailSent size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          <span className="tabular-nums">
            {t('corpTaxBook.mailQueue.chip.label')}{' '}
            {s.done
              ? t('corpTaxBook.mailQueue.chip.sent')
              : t('corpTaxBook.mailQueue.chip.progress', { sent: s.sent, total: s.total })}
          </span>
          {s.failed > 0 && (
            <span className="inline-flex items-center gap-0.5 text-warning">
              <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              {s.failed}
            </span>
          )}
          {!s.done && (
            <ProgressBar
              label={t('corpTaxBook.mailQueue.summary.progressLabel')}
              value={s.sent + s.failed}
              max={Math.max(s.total, 1)}
              size="xs"
              className="w-12"
            />
          )}
          <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[34rem] max-w-[90vw] space-y-3 p-3">
        <p className="text-sm font-semibold">{t('corpTaxBook.mailQueue.panelTitle')}</p>
        <div className="max-h-[28rem] overflow-y-auto">{panel}</div>
      </PopoverContent>
    </Popover>
  );
}
