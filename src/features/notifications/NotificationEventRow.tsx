import { useTranslation } from 'react-i18next';
import { AggregateRow } from './AggregateRow';
import { PermissionNote } from './PermissionNote';
import { MailPushBadge, NearbyPushBadge, ScheduledPushBadge } from './ScheduledPushBadge';
import { EventThresholdsList } from './EventThresholdsList';
import { SharedPopMutes } from './SharedPopMutes';
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
  pushBadgeKind,
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
  omitUnavailableNote?: boolean;
}) {
  const { t } = useTranslation();
  const entry = eventEntry(eventId);
  const badge = pushBadgeKind(eventId);
  const isCorp = isCorpEventId(eventId);
  const isSharedMoonPop = eventId === 'sharedMoonPop';
  const availability = useEventAvailability(eventId, context);
  const { prefsValue } = context;
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
        badge === null ? undefined : badge === 'nearby' ? (
          <NearbyPushBadge />
        ) : badge === 'mail' ? (
          <MailPushBadge />
        ) : (
          <ScheduledPushBadge kind={badge} />
        )
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
      channelOff={context.channelOff}
      visibleCharacterIds={context.visibleCharacterIds}
      forceExpanded={context.forceExpanded}
      isDesktop={context.isDesktop}
      notes={
        entry.rowHintKey !== null || (missing !== null && !isCorp) || isSharedMoonPop ? (
          <>
            {entry.rowHintKey !== null && (
              <p className="text-[0.6875rem] text-text-dim">{t(entry.rowHintKey)}</p>
            )}
            {missing !== null && !isCorp && <PermissionNote {...missing} />}
            {isSharedMoonPop && (
              <SharedPopMutes prefsValue={prefsValue} characters={context.characters} />
            )}
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
