import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { estimateMinutes } from '@/engine/corpTaxBook/mailQueue';

/**
 * D16's notice on Send: EVE's hidden mail limit (about 5 a minute), worked out
 * for this batch. The Statements tab shows it beside the Send button.
 */
export function MailLimitNotice({ count, senderName }: { count: number; senderName?: string }) {
  const { t } = useTranslation();
  const minutes = t('corpTaxBook.mailQueue.minutes', { count: estimateMinutes(count) });
  return (
    <div className="flex gap-2 rounded-xs border border-line bg-panel-2 p-3 text-sm">
      <Icon.Info size={Icon.ICON_SIZE.md} className="mt-0.5 shrink-0 text-text-dim" aria-hidden />
      <div className="space-y-1">
        <p>{t('corpTaxBook.mailQueue.notice.line', { count, minutes })}</p>
        <p className="text-text-dim">
          {t('corpTaxBook.mailQueue.notice.detail', {
            from: senderName ? t('corpTaxBook.mailQueue.notice.from', { name: senderName }) : '',
          })}
        </p>
      </div>
    </div>
  );
}
