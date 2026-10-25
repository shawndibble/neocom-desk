import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { ScheduledPush, ICON_SIZE } from '@/components/ui/icons';
import { useAlertsNearby } from './alertsGrant';

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
const BADGE_LABELS = {
  scheduled: 'settings.notifications.scheduledPushBadge',
  server: 'settings.notifications.serverPushBadge',
  nearby: 'settings.notifications.nearbyPushBadge',
} as const;

export function ScheduledPushBadge({
  kind = 'scheduled',
}: {
  kind?: 'scheduled' | 'server' | 'nearby';
}) {
  const { t } = useTranslation();
  const label = t(BADGE_LABELS[kind]);
  return (
    <Tooltip content={label} openOnTap>
      <span role="img" aria-label={label} className="shrink-0 text-accent">
        <ScheduledPush size={ICON_SIZE.sm} />
      </span>
    </Tooltip>
  );
}

/**
 * The same mark on a nearby event's row (ADR 0028), shown once some Character
 * on this device has an Alerts Grant that carries the location: only then can
 * the server push it to a closed app.
 */
export function NearbyPushBadge() {
  const { characterIds } = useAlertsNearby();
  return characterIds.length > 0 ? <ScheduledPushBadge kind="nearby" /> : null;
}
