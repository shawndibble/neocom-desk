/**
 * One Notification Event on the event-first page: the shared aggregate row
 * wired to this event's per-Character preferences, plus what used to hang off
 * a Character's own row: the event's delivery caveat, a pointer for
 * Characters that have not granted the Permission it needs, and its warn-ahead
 * times.
 */
import { useTranslation } from 'react-i18next';
import { AggregateRow } from './AggregateRow';
import { PermissionNote } from './PermissionNote';
import { NearbyPushBadge, ScheduledPushBadge } from './ScheduledPushBadge';
import { isNearbyServerEvent } from './serverPushChoices';
import { EventThresholdsList } from './EventThresholdsList';
import { eventEntry } from './eventEntries';
import { eventLabelKey, isCorpEventId, type NotificationEventId } from './events';
import { isEventEnabledFor } from './eventSelection';
import {
  broadcastEventChannelPref,
  characterEventPrefs,
  toggleEventChannelPref,
  useNotificationPreferences,
} from './preferences';
import {
  isPushBadged,
  missingPermissionSummary,
  useEventAvailability,
  type EventRowContext,
} from './eventRowSupport';
import type { CharacterRef } from './CharacterChipGrid';

export function NotificationEventRow({
  eventId,
  context,
  omitUnavailableNote = false,
}: {
  eventId: NotificationEventId;
  context: EventRowContext;
  /** The Topic already says nobody can use its events. */
  omitUnavailableNote?: boolean;
}) {
  const { t } = useTranslation();
  const entry = eventEntry(eventId);
  // A corp event's note is said once on its group header, not on every row.
  const isCorp = isCorpEventId(eventId);
  const availability = useEventAvailability(eventId, context);
  const { prefsValue } = context;
  // Writes read the store at click time, not a closed-over prop: a boot-time
  // refresh re-renders from outside, and a stale value would drop an edit.
  const currentValue = () => useNotificationPreferences.getState().value;

  const missing = missingPermissionSummary([eventId], context);
  const narrowed = (character: CharacterRef) =>
    context.visibleCharacterIds === null || context.visibleCharacterIds.has(character.characterId);
  const thresholdCharacters = context.characters.filter(
    (character) =>
      narrowed(character) &&
      availability(character.characterId).enabled &&
      (isEventEnabledFor(
        characterEventPrefs(prefsValue, character.characterId),
        eventId,
        'browser'
      ) ||
        isEventEnabledFor(characterEventPrefs(prefsValue, character.characterId), eventId, 'feed'))
  );

  // What the row's Warn ahead button says; none when no Character has the event on.
  const warnAheadLabel =
    entry.thresholds === null || thresholdCharacters.length === 0
      ? null
      : entry.thresholds.headingKey === undefined
        ? t('settings.notifications.warnAheadTimes', { count: thresholdCharacters.length })
        : t(entry.thresholds.headingKey);

  return (
    <AggregateRow
      label={t(eventLabelKey(eventId))}
      labelAccessory={
        isPushBadged(eventId) ? (
          <ScheduledPushBadge />
        ) : isNearbyServerEvent(eventId) ? (
          <NearbyPushBadge />
        ) : undefined
      }
      characters={context.characters}
      availability={availability}
      readValue={(id, channel) =>
        isEventEnabledFor(characterEventPrefs(prefsValue, id), eventId, channel)
      }
      onToggleAll={(ids, channel) =>
        void broadcastEventChannelPref(ids, currentValue(), eventId, channel)
      }
      onToggleOne={(id, channel) => toggleEventChannelPref(id, currentValue(), eventId, channel)}
      omitUnavailableNote={omitUnavailableNote}
      browserBlocked={context.browserBlocked}
      visibleCharacterIds={context.visibleCharacterIds}
      forceExpanded={context.forceExpanded}
      isDesktop={context.isDesktop}
      notes={
        entry.rowHintKey !== null || (missing !== null && !isCorp) ? (
          <>
            {entry.rowHintKey !== null && (
              <p className="text-[0.6875rem] text-text-dim">{t(entry.rowHintKey)}</p>
            )}
            {missing !== null && !isCorp && <PermissionNote {...missing} />}
          </>
        ) : undefined
      }
      warnAhead={
        entry.thresholds !== null && warnAheadLabel !== null
          ? {
              label: warnAheadLabel,
              body: (
                <EventThresholdsList
                  thresholds={entry.thresholds}
                  characters={thresholdCharacters}
                  prefsValue={prefsValue}
                />
              ),
            }
          : undefined
      }
    />
  );
}
