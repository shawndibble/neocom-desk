/**
 * One Notification Event on the event-first page: the shared aggregate row
 * wired to this event's per-Character preferences, plus what used to hang off
 * a Character's own row: the event's delivery caveat, a pointer for
 * Characters that have not granted the Permission it needs, and its warn-ahead
 * times.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { PERMISSIONS } from '@/esi/registry';
import { tabPath } from '@/lib/pageTabs';
import { SETTINGS_TABS } from '@/app/pageTabs';
import { AggregateRow } from './AggregateRow';
import { ScheduledPushBadge } from './ScheduledPushBadge';
import { EventThresholdsList } from './EventThresholdsList';
import { eventApplicability } from './eventApplicability';
import { eventEntry } from './eventEntries';
import { eventLabelKey, type NotificationEventId } from './events';
import { isEventEnabledFor } from './eventSelection';
import {
  broadcastEventChannelPref,
  characterEventPrefs,
  toggleEventChannelPref,
  useNotificationPreferences,
} from './preferences';
import {
  EMPTY_SCOPES,
  isPushBadged,
  useEventAvailability,
  type EventRowContext,
} from './eventRowSupport';

export function NotificationEventRow({
  eventId,
  context,
}: {
  eventId: NotificationEventId;
  context: EventRowContext;
}) {
  const { t } = useTranslation();
  const entry = eventEntry(eventId);
  const availability = useEventAvailability(eventId, context);
  const { prefsValue } = context;
  // Writes read the store at click time, not a closed-over prop: a boot-time
  // refresh re-renders from outside, and a stale value would drop an edit.
  const currentValue = () => useNotificationPreferences.getState().value;

  const missingPermission = context.characters
    .map((character) =>
      eventApplicability(
        eventId,
        context.scopesByCharacterId.get(character.characterId) ?? EMPTY_SCOPES,
        undefined
      )
    )
    .find((state) => state.missingPermission !== null)?.missingPermission;
  const missingCount = context.characters.filter(
    (character) =>
      eventApplicability(
        eventId,
        context.scopesByCharacterId.get(character.characterId) ?? EMPTY_SCOPES,
        undefined
      ).missingPermission !== null
  ).length;

  const thresholdCharacters = context.characters.filter(
    (character) =>
      availability(character.characterId).enabled &&
      (isEventEnabledFor(
        characterEventPrefs(prefsValue, character.characterId),
        eventId,
        'browser'
      ) ||
        isEventEnabledFor(characterEventPrefs(prefsValue, character.characterId), eventId, 'feed'))
  );

  return (
    <AggregateRow
      label={t(eventLabelKey(eventId))}
      labelAccessory={isPushBadged(eventId) ? <ScheduledPushBadge /> : undefined}
      characters={context.characters}
      availability={availability}
      readValue={(id, channel) =>
        isEventEnabledFor(characterEventPrefs(prefsValue, id), eventId, channel)
      }
      onToggleAll={(ids, channel) =>
        void broadcastEventChannelPref(ids, currentValue(), eventId, channel)
      }
      onToggleOne={(id, channel) =>
        void toggleEventChannelPref(id, currentValue(), eventId, channel)
      }
      browserBlocked={context.browserBlocked}
      visibleCharacterIds={context.visibleCharacterIds}
      forceExpanded={context.forceExpanded}
      isDesktop={context.isDesktop}
    >
      {entry.rowHintKey !== null && (
        <p className="text-[0.6875rem] text-text-dim">{t(entry.rowHintKey)}</p>
      )}
      {missingPermission != null && (
        <p className="text-[0.6875rem] text-text-dim">
          {t('settings.notifications.permissionNote', {
            count: missingCount,
            permission: t(PERMISSIONS[missingPermission].labelKey),
          })}{' '}
          <Link to={tabPath(SETTINGS_TABS, 'permissions')} className={inlineLinkClassName}>
            {t('settings.notifications.permissionNoteLink')}
          </Link>
        </p>
      )}
      {entry.thresholds !== null && (
        <EventThresholdsList
          thresholds={entry.thresholds}
          characters={thresholdCharacters}
          prefsValue={prefsValue}
        />
      )}
    </AggregateRow>
  );
}
