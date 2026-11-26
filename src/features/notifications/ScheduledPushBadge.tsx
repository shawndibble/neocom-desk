import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { GlyphSlash } from '@/components/ui/GlyphSlash';
import { ScheduledPush, ICON_SIZE } from '@/components/ui/icons';
import { useAlertsMail, useAlertsNearby, useEveGrantMissing } from './alertsGrant';

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

export function MissingGrantBadge({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation();
  const label = t(labelKey);
  return (
    <Tooltip content={label} openOnTap>
      <span role="img" aria-label={label} className="relative shrink-0 text-danger">
        <ScheduledPush size={ICON_SIZE.sm} />
        <GlyphSlash />
      </span>
    </Tooltip>
  );
}

export function NearbyPushBadge() {
  const { supported, characterIds } = useAlertsNearby();
  if (characterIds.length > 0) return <ScheduledPushBadge kind="nearby" />;
  return supported ? (
    <MissingGrantBadge labelKey="settings.notifications.missingGrantBadge.nearby" />
  ) : null;
}

export function MailPushBadge() {
  const { supported, characterIds } = useAlertsMail();
  if (characterIds.length > 0) return <ScheduledPushBadge kind="mail" />;
  return supported ? (
    <MissingGrantBadge labelKey="settings.notifications.missingGrantBadge.mail" />
  ) : null;
}

export function EveNotificationBadge({ onlyWhenMissing = false }: { onlyWhenMissing?: boolean }) {
  const missing = useEveGrantMissing();
  if (missing === null) return null;
  if (!missing) return onlyWhenMissing ? null : <ScheduledPushBadge kind="server" />;
  return <EveGrantMissingBadge />;
}

export function EveGrantMissingBadge() {
  return <MissingGrantBadge labelKey="settings.notifications.missingGrantBadge.base" />;
}
