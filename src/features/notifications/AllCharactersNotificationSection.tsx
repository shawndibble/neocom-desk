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
 *
 * `eveNotification`'s per-type breakdown (issue #745) gets the same
 * broadcast treatment underneath its row: someone who doesn't care about New
 * Mail but does want War Declared can flip that one type for every Character
 * at once, rather than only being able to broadcast the whole
 * `eveNotification` event on or off. Not gated on any Character's scope —
 * unlike the per-Character section, there is no single grant to gate on
 * here, and the same is already true of the top-level `eveNotification` row
 * above it.
 */
import { useTranslation } from 'react-i18next';
import { Caret } from '@/components/ui';
import { SelectionCheckbox } from '@/features/character/SelectionCheckbox';
import { NOTIFICATION_EVENT_IDS, eventLabelKey, type NotificationEventId } from './events';
import {
  broadcastEventChannelPref,
  broadcastAllEventsChannelPref,
  broadcastEveTypeChannelPref,
  broadcastAllEveTypesChannelPref,
  type NotificationPreferencesValue,
} from './preferences';
import {
  selectionStateForEventAcrossCharacters,
  selectionStateForAllCharactersAllEvents,
  selectionStateForEveTypeAcrossCharacters,
  selectionStateForAllCharactersEveTypes,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_FAMILIES,
  eveTypesByFamily,
} from './eventSelection';
import { eveTypeLabel } from './eveTypeLabel';
import { CHANNEL_COLUMNS, ChannelColumnHeadings } from './ChannelColumns';
import { layoutNotificationEvents } from './notificationLayout';

export function AllCharactersNotificationSection({
  characterIds,
  prefsValue,
  browserBlocked,
  expanded,
  onToggleExpanded,
}: {
  characterIds: readonly number[];
  prefsValue: NotificationPreferencesValue;
  /** Denied browser permission disables the browser column here too, matching an individual Character's row. */
  browserBlocked: boolean;
  /** Collapsed by default, like a Character's own section; the select-all column stays usable either way. */
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const { t } = useTranslation();
  const layout = layoutNotificationEvents(NOTIFICATION_EVENT_IDS);
  const corpGroupLabel = t('settings.notifications.corpGroup');

  const renderEvent = (eventId: NotificationEventId) => {
    const eventLabel = t(eventLabelKey(eventId));
    return (
      <li key={eventId}>
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
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
                disabled={channel === 'browser' && browserBlocked}
                onToggle={() =>
                  void broadcastEventChannelPref(characterIds, prefsValue, eventId, channel)
                }
                label={t(`settings.notifications.toggleAllCharactersLabel.${channel}`, {
                  event: eventLabel,
                })}
              />
            ))}
          </div>
        </div>
        {/*
                Per-type broadcast underneath the single eveNotification row
                (issue #745) — same Family grouping as a Character's own
                section, but every checkbox here reads/writes the
                cross-Character aggregate instead of one Character's value.
              */}
        {eventId === 'eveNotification' && (
          <div className="border-t border-line bg-panel/40 pl-3">
            {NOTIFICATION_FAMILIES.map((family) => {
              const familyTypes = eveTypesByFamily(family);
              if (familyTypes.length === 0) return null;
              const familyLabel = t(`settings.notifications.family.${family}`);
              return (
                <div key={family}>
                  <div className="flex items-center justify-between gap-3 border-t border-line/60 bg-panel/30 px-3 py-1">
                    <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                      {familyLabel}
                    </span>
                    <div className={CHANNEL_COLUMNS}>
                      {NOTIFICATION_CHANNELS.map((channel) => (
                        <SelectionCheckbox
                          key={channel}
                          state={selectionStateForAllCharactersEveTypes(
                            characterIds,
                            familyTypes,
                            prefsValue.eveNotificationTypesByCharacter ?? {},
                            channel
                          )}
                          disabled={channel === 'browser' && browserBlocked}
                          onToggle={() =>
                            void broadcastAllEveTypesChannelPref(
                              characterIds,
                              prefsValue,
                              familyTypes,
                              channel
                            )
                          }
                          label={t(`settings.notifications.selectAllCharactersFamily.${channel}`, {
                            family: familyLabel,
                          })}
                        />
                      ))}
                    </div>
                  </div>
                  <ul className="divide-y divide-line/60">
                    {familyTypes.map((type) => {
                      const typeLabel = eveTypeLabel(t, type);
                      return (
                        <li
                          key={type}
                          className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
                        >
                          <span className="truncate text-text-dim" title={typeLabel}>
                            {typeLabel}
                          </span>
                          <div className={CHANNEL_COLUMNS}>
                            {NOTIFICATION_CHANNELS.map((channel) => (
                              <SelectionCheckbox
                                key={channel}
                                state={selectionStateForEveTypeAcrossCharacters(
                                  characterIds,
                                  type,
                                  prefsValue.eveNotificationTypesByCharacter ?? {},
                                  channel
                                )}
                                disabled={channel === 'browser' && browserBlocked}
                                onToggle={() =>
                                  void broadcastEveTypeChannelPref(
                                    characterIds,
                                    prefsValue,
                                    type,
                                    channel
                                  )
                                }
                                label={t(
                                  `settings.notifications.toggleAllCharactersLabel.${channel}`,
                                  { event: typeLabel }
                                )}
                              />
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="rounded-xs border border-accent/40 bg-panel/85 backdrop-blur-sm">
      <div
        className={`flex min-h-8 items-center gap-2 pr-2.5 ${expanded ? 'border-b border-line' : ''}`}
      >
        {/* Same toggle as a Character's own header (`min-h-11 md:min-h-0`, issue #1118). */}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggleExpanded}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-2.5 text-left text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:min-h-0"
        >
          <Caret expanded={expanded} />
          <span className="min-w-0 truncate">{t('settings.notifications.allCharactersLabel')}</span>
        </button>
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
              disabled={channel === 'browser' && browserBlocked}
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
      {expanded && (
        <>
          <p className="border-b border-line bg-panel-2 px-3 py-1.5 text-[0.6875rem] text-text-dim">
            {t('settings.notifications.allCharactersHint')}
          </p>
          {/* The same captions a Character's own section shows. Without them this
            section is two unlabelled columns of checkboxes — and unlike that
            section, which is collapsed by default, this one is always open, so
            these are the first channel checkboxes anyone sees. */}
          <div className="bg-panel-2">
            <ChannelColumnHeadings />
          </div>
          <ul className="divide-y divide-line bg-panel-2">
            {layout.ordinary.map((eventId) => renderEvent(eventId))}
            {layout.corp.length > 0 && (
              <li key="corp-group">
                {/* Headed like an EVE family: a label, then a broadcast select-all per channel. */}
                <div className="flex items-center justify-between gap-3 bg-panel/30 px-3 py-1">
                  <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {corpGroupLabel}
                  </span>
                  <div className={CHANNEL_COLUMNS}>
                    {NOTIFICATION_CHANNELS.map((channel) => (
                      <SelectionCheckbox
                        key={channel}
                        state={selectionStateForAllCharactersAllEvents(
                          characterIds,
                          layout.corp,
                          prefsValue.perCharacter,
                          channel
                        )}
                        disabled={channel === 'browser' && browserBlocked}
                        onToggle={() =>
                          void broadcastAllEventsChannelPref(
                            characterIds,
                            prefsValue,
                            layout.corp,
                            channel
                          )
                        }
                        label={t(`settings.notifications.selectAllCharactersFamily.${channel}`, {
                          family: corpGroupLabel,
                        })}
                      />
                    ))}
                  </div>
                </div>
                <ul className="divide-y divide-line border-t border-line pl-3">
                  {layout.corp.map((eventId) => renderEvent(eventId))}
                </ul>
              </li>
            )}
            {layout.eve !== null && renderEvent(layout.eve)}
          </ul>
        </>
      )}
    </div>
  );
}
