import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { ScheduledPush, ICON_SIZE } from '@/components/ui/icons';

/**
 * The "arrives with the app closed" mark on a Scheduled Push event's row.
 *
 * `role="img"` plus `aria-label` rather than a focusable trigger (the
 * `MaterialsTable` pattern, not the column captions' one): the meaning has to
 * reach a screen reader, but there are seventeen rows per Character here and
 * a tab stop on each would make the panel worse to keyboard through than the
 * badge is worth.
 */
export function ScheduledPushBadge() {
  const { t } = useTranslation();
  const label = t('settings.notifications.scheduledPushBadge');
  return (
    <Tooltip content={label} openOnTap>
      <span role="img" aria-label={label} className="shrink-0 text-accent">
        <ScheduledPush size={ICON_SIZE.sm} />
      </span>
    </Tooltip>
  );
}
