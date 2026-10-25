import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { ScheduledPush, ICON_SIZE } from '@/components/ui/icons';

/**
 * The "arrives with the app closed" mark on a Scheduled Push event's row, or on
 * a server-pushed event's (`kind="server"`, issue #5121): same mark, its own
 * promise, since those are not limited to a 72-hour window.
 *
 * `role="img"` plus `aria-label` rather than a focusable trigger (the
 * `MaterialsTable` pattern, not the column captions' one): the meaning has to
 * reach a screen reader, but there are seventeen rows here and
 * a tab stop on each would make the panel worse to keyboard through than the
 * badge is worth.
 */
export function ScheduledPushBadge({ kind = 'scheduled' }: { kind?: 'scheduled' | 'server' }) {
  const { t } = useTranslation();
  const label = t(
    kind === 'server'
      ? 'settings.notifications.serverPushBadge'
      : 'settings.notifications.scheduledPushBadge'
  );
  return (
    <Tooltip content={label} openOnTap>
      <span role="img" aria-label={label} className="shrink-0 text-accent">
        <ScheduledPush size={ICON_SIZE.sm} />
      </span>
    </Tooltip>
  );
}
