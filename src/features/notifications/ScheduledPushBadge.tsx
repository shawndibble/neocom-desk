import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { ScheduledPush, ICON_SIZE } from '@/components/ui/icons';
import { useAlertsMail, useAlertsNearby, useEveGrantMissing } from './alertsGrant';

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
  mail: 'settings.notifications.mailPushBadge',
} as const;

export function ScheduledPushBadge({
  kind = 'scheduled',
}: {
  kind?: 'scheduled' | 'server' | 'nearby' | 'mail';
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
 * The mark's other state (issue #5330): the row's event needs a grant no
 * Character on this device has, so it cannot reach a closed app yet. Danger
 * colour plus a slash, so the colour is never the only signal; the tooltip
 * names the step.
 */
export function MissingGrantBadge({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation();
  const label = t(labelKey);
  return (
    <Tooltip content={label} openOnTap>
      <span role="img" aria-label={label} className="relative shrink-0 text-danger">
        <ScheduledPush size={ICON_SIZE.sm} />
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        >
          <path d="M2 14 L14 2" />
        </svg>
      </span>
    </Tooltip>
  );
}

/**
 * The same mark on a nearby event's row (ADR 0028): the normal mark once some
 * Character on this device has an Alerts Grant that carries the location, the
 * missing-grant mark while none does. Nothing while the server does not take
 * the scope, since there is then no step to take.
 */
export function NearbyPushBadge() {
  const { supported, characterIds } = useAlertsNearby();
  if (characterIds.length > 0) return <ScheduledPushBadge kind="nearby" />;
  return supported ? (
    <MissingGrantBadge labelKey="settings.notifications.missingGrantBadge.nearby" />
  ) : null;
}

/** The same two states on the new-mail row (ADR 0029), for the mail scope. */
export function MailPushBadge() {
  const { supported, characterIds } = useAlertsMail();
  if (characterIds.length > 0) return <ScheduledPushBadge kind="mail" />;
  return supported ? (
    <MissingGrantBadge labelKey="settings.notifications.missingGrantBadge.mail" />
  ) : null;
}

/**
 * The mark on an EVE notification row: every type reaches a closed app only
 * through an active Alerts Grant (ADR 0020). `onlyWhenMissing` is for the
 * ~100 type rows, which carry no mark today: they show the missing-grant mark
 * and nothing else, so the page does not gain a column of normal marks.
 */
export function EveNotificationBadge({ onlyWhenMissing = false }: { onlyWhenMissing?: boolean }) {
  const missing = useEveGrantMissing();
  if (missing === null) return null;
  if (!missing) return onlyWhenMissing ? null : <ScheduledPushBadge kind="server" />;
  return <EveGrantMissingBadge />;
}

export function EveGrantMissingBadge() {
  return <MissingGrantBadge labelKey="settings.notifications.missingGrantBadge.base" />;
}
