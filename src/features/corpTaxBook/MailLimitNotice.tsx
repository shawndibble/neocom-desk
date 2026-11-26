import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { estimateMinutes } from '@/engine/corpTaxBook/mailQueue';
import { Well } from '@/components/ui/Well';

export function MailLimitNotice({ count, senderName }: { count: number; senderName?: string }) {
  const { t } = useTranslation();
  const minutes = t('corpTaxBook.mailQueue.minutes', { count: estimateMinutes(count) });
  return (
    <Well size="lg" className="flex gap-2 text-sm">
      <Icon.Info size={Icon.ICON_SIZE.md} className="mt-0.5 shrink-0 text-text-dim" aria-hidden />
      <div className="space-y-1">
        <p>{t('corpTaxBook.mailQueue.notice.line', { count, minutes })}</p>
        <p className="text-text-dim">
          {t('corpTaxBook.mailQueue.notice.detail', {
            from: senderName ? t('corpTaxBook.mailQueue.notice.from', { name: senderName }) : '',
          })}
        </p>
      </div>
    </Well>
  );
}
