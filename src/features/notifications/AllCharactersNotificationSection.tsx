/**
 * "All Characters" master row (issue #738): a virtual row, not a real
 * Character, that broadcasts an event/channel value to every known
 * Character's `perCharacter` map at once. A one-time broadcast to
 * Characters that exist right now — never a saved default applied to ones
 * added later, which is explicitly out of scope. Same per-event/per-channel
 * shape as a Character's own section (`NotificationsPanel.tsx`), but every
 * checkbox here reads a cross-Character aggregate instead of one Character's
 * own value, so it renders mixed/indeterminate when Characters currently
 * disagree rather than falsely showing checked or unchecked.
 */
import { useTranslation } from 'react-i18next';
import { SelectionCheckbox } from '@/features/character/SelectionCheckbox';
import { NOTIFICATION_EVENT_IDS, eventLabelKey } from './events';
import {
  broadcastEventChannelPref,
  broadcastAllEventsChannelPref,
  type NotificationPreferencesValue,
} from './preferences';
import {
  selectionStateForEventAcrossCharacters,
  selectionStateForAllCharactersAllEvents,
  NOTIFICATION_CHANNELS,
} from './eventSelection';

/** Matches `NotificationsPanel.tsx`'s own per-channel grid track so the two sections visually line up. */
const CHANNEL_COLUMNS = 'grid shrink-0 grid-cols-[4.25rem_4.25rem] justify-items-center';

export function AllCharactersNotificationSection({
  characterIds,
  prefsValue,
}: {
  characterIds: readonly number[];
  prefsValue: NotificationPreferencesValue;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xs border border-accent/40 bg-panel/85 backdrop-blur-sm">
      <div className="flex min-h-8 items-center gap-2 border-b border-line px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[0.6875rem] font-semibold tracking-widest text-text uppercase">
          {t('settings.notifications.allCharactersLabel')}
        </span>
        <div className={CHANNEL_COLUMNS}>
          {NOTIFICATION_CHANNELS.map((channel) => (
            <SelectionCheckbox
              key={channel}
              state={selectionStateForAllCharactersAllEvents(
                characterIds,
                NOTIFICATION_EVENT_IDS,
                prefsValue.perCharacter,
                channel
              )}
              onToggle={() =>
                void broadcastAllEventsChannelPref(
                  characterIds,
                  prefsValue,
                  NOTIFICATION_EVENT_IDS,
                  channel
                )
              }
              label={t(`settings.notifications.selectAllCharacters.${channel}`)}
            />
          ))}
        </div>
      </div>
      <p className="border-b border-line bg-panel-2 px-3 py-1.5 text-[0.6875rem] text-text-dim">
        {t('settings.notifications.allCharactersHint')}
      </p>
      <ul className="divide-y divide-line bg-panel-2">
        {NOTIFICATION_EVENT_IDS.map((eventId) => {
          const eventLabel = t(eventLabelKey(eventId));
          return (
            <li key={eventId} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
              <span className="min-w-0 truncate text-text">{eventLabel}</span>
              <div className={CHANNEL_COLUMNS}>
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <SelectionCheckbox
                    key={channel}
                    state={selectionStateForEventAcrossCharacters(
                      characterIds,
                      eventId,
                      prefsValue.perCharacter,
                      channel
                    )}
                    onToggle={() =>
                      void broadcastEventChannelPref(characterIds, prefsValue, eventId, channel)
                    }
                    label={t(`settings.notifications.toggleAllCharactersLabel.${channel}`, {
                      event: eventLabel,
                    })}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
