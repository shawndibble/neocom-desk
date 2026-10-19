/**
 * Settings > Notifications' event list: every Notification Event once, filed
 * under named groups, each row speaking for all Characters (see
 * `AggregateRow`). Corp events keep one "Corp notifications" group with its
 * shared best-effort note, and EVE notifications close the list.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import { ChannelColumnHeadings } from './ChannelColumns';
import { groupNotificationEvents } from './eventGroups';
import { NotificationEventRow } from './NotificationEventRow';
import { PermissionNote } from './PermissionNote';
import { missingPermissionSummary, type EventRowContext } from './eventRowSupport';
import { EveNotificationRow } from './EveNotificationRow';
import type { NotificationEventId } from './events';

export function NotificationEventList({
  eventIds,
  context,
  extraTypesByCharacter,
}: {
  eventIds: readonly NotificationEventId[];
  context: EventRowContext;
  extraTypesByCharacter: ReadonlyMap<number, readonly string[]>;
}) {
  const { t } = useTranslation();
  const layout = groupNotificationEvents(eventIds);
  // Every corp event rides the one opt-in Corporation Permission, so the group says it once.
  const corpMissing = missingPermissionSummary(layout.corp, context);
  const heading = (text: string) => (
    <h3 className={cx(eyebrowClassName, 'border-t border-line bg-panel/40 px-3 py-1')}>{text}</h3>
  );
  return (
    <div className="rounded-xs border border-line bg-panel/85 backdrop-blur-sm">
      <ChannelColumnHeadings pinned />
      {layout.groups.map((group) => (
        <section key={group.key}>
          {heading(t(`settings.notifications.group.${group.key}`))}
          <ul className="divide-y divide-line">
            {group.eventIds.map((eventId) => (
              <NotificationEventRow key={eventId} eventId={eventId} context={context} />
            ))}
          </ul>
        </section>
      ))}
      {layout.corp.length > 0 && (
        <section>
          {heading(t('settings.notifications.corpGroup'))}
          <div className="space-y-1 border-t border-line bg-panel/60 px-3 py-1.5 text-[0.6875rem] text-text-dim">
            <p>{t('settings.notifications.corpEventBestEffortHint')}</p>
            {corpMissing !== null && <PermissionNote {...corpMissing} />}
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {layout.corp.map((eventId) => (
              <NotificationEventRow key={eventId} eventId={eventId} context={context} />
            ))}
          </ul>
        </section>
      )}
      {layout.eve !== null && (
        <section>
          {heading(t('settings.notifications.group.eve'))}
          <ul className="divide-y divide-line">
            <EveNotificationRow context={context} extraTypesByCharacter={extraTypesByCharacter} />
          </ul>
        </section>
      )}
    </div>
  );
}
