import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

interface MailSelectionBarProps {
  count: number;
  busy: boolean;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
}

/** Select mode's bar above the list: how many mails are ticked, and what to do with them. */
export function MailSelectionBar({
  count,
  busy,
  onMarkRead,
  onMarkUnread,
  onDelete,
}: MailSelectionBarProps) {
  const { t } = useTranslation();
  const none = count === 0;
  return (
    <div
      role="toolbar"
      aria-label={t('mail.selectionLabel')}
      className="flex flex-wrap items-center gap-2 border-b border-line p-2"
    >
      <span className="text-sm font-semibold text-text" aria-live="polite">
        {t('mail.selectedCount', { count })}
      </span>
      <Button size="sm" onClick={onMarkRead} aria-disabled={none || busy || undefined}>
        {t('mail.markRead')}
      </Button>
      <Button size="sm" onClick={onMarkUnread} aria-disabled={none || busy || undefined}>
        {t('mail.markUnread')}
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={onDelete}
        aria-disabled={none || busy || undefined}
      >
        {t('mail.delete')}
      </Button>
    </div>
  );
}
