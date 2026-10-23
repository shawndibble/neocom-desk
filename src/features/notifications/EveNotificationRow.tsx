/**
 * The EVE notifications event, with its per-type breakdown (issue #274)
 * listed straight under it, not behind it: every type from the closed
 * allow-list grouped by Notification Family (issue #352), plus types the
 * server has seen beyond it (issue #3755) under "Other". Each type is its own
 * aggregate row, so it can be set for every Character at once and opened to fix
 * individual ones. The event's own row still opens, to its per-Character chips.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useTranslation } from 'react-i18next';
import { SelectionCheckbox } from '@/features/character/SelectionCheckbox';
import { AggregateRow } from './AggregateRow';
import { EVENT_ROW_GRID, DEVICE_CELL, ALERTS_CELL } from './ChannelColumns';
import { eveTypeLabel } from './eveTypeLabel';
import { PermissionNote } from './PermissionNote';
import {
  missingPermissionSummary,
  useEventAvailability,
  type EventRowContext,
} from './eventRowSupport';
import { eventLabelKey } from './events';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_FAMILIES,
  eveTypesByFamily,
  isEveTypeEnabledFor,
  selectionStateForAllCharactersEveTypes,
  isEventEnabledFor,
} from './eventSelection';
import {
  broadcastAllEveTypesChannelPref,
  broadcastEveTypeChannelPref,
  broadcastEventChannelPref,
  characterEveTypePrefs,
  characterEventPrefs,
  toggleEveTypeChannelPref,
  toggleEventChannelPref,
  useNotificationPreferences,
} from './preferences';

export function EveNotificationRow({
  context,
  extraTypesByCharacter,
  showTypes = true,
}: {
  context: EventRowContext;
  /** Seen ESI types outside the allow-list, per Character. */
  extraTypesByCharacter: ReadonlyMap<number, readonly string[]>;
  /** Leave the type list out: a search stacks every match, and this list is the longest on the page. */
  showTypes?: boolean;
}) {
  const { t } = useTranslation();
  const eventId = 'eveNotification' as const;
  const availability = useEventAvailability(eventId, context);
  const { prefsValue } = context;
  const currentValue = () => useNotificationPreferences.getState().value;
  const missing = missingPermissionSummary([eventId], context);
  const applicableIds = context.characters
    .filter((character) => availability(character.characterId).enabled)
    .map((character) => character.characterId);
  const eveTypes = prefsValue.eveNotificationTypesByCharacter ?? {};
  const otherTypes = [
    ...new Set(applicableIds.flatMap((id) => extraTypesByCharacter.get(id) ?? [])),
  ];
  const families = [
    ...NOTIFICATION_FAMILIES.map((family) => ({ key: family, types: eveTypesByFamily(family) })),
    { key: 'other', types: otherTypes },
  ].filter((family) => family.types.length > 0);

  return (
    <>
      <AggregateRow
        label={t(eventLabelKey(eventId))}
        characters={context.characters}
        availability={availability}
        readValue={(id, channel) =>
          isEventEnabledFor(characterEventPrefs(prefsValue, id), eventId, channel)
        }
        onToggleAll={(ids, channel) =>
          void broadcastEventChannelPref(ids, currentValue(), eventId, channel)
        }
        onToggleOne={(id, channel) => toggleEventChannelPref(id, currentValue(), eventId, channel)}
        browserBlocked={context.browserBlocked}
        visibleCharacterIds={context.visibleCharacterIds}
        // Never opened by a search: its chips are not what a search is after.
        forceExpanded={false}
        isDesktop={context.isDesktop}
        notes={missing !== null ? <PermissionNote {...missing} /> : undefined}
      />
      {showTypes && (
        <li className="border-t border-line py-2">
          <div className="space-y-2">
            <p className="text-[0.6875rem] text-text-dim">
              {t('settings.notifications.eveTypesHint')}
            </p>
            {families.map(({ key, types }) => {
              const familyLabel = t(`settings.notifications.family.${key}`);
              return (
                <section key={key} aria-label={familyLabel}>
                  <div
                    className={`flex items-center justify-between gap-3 border-t border-line/60 px-3 py-1 ${EVENT_ROW_GRID}`}
                  >
                    <span className={`${eyebrowClassName} md:col-start-1`}>{familyLabel}</span>
                    {NOTIFICATION_CHANNELS.map((channel, index) => (
                      <div key={channel} className={index === 0 ? DEVICE_CELL : ALERTS_CELL}>
                        <SelectionCheckbox
                          state={selectionStateForAllCharactersEveTypes(
                            applicableIds,
                            types,
                            eveTypes,
                            channel
                          )}
                          disabled={
                            applicableIds.length === 0 ||
                            (channel === 'browser' && context.browserBlocked)
                          }
                          onToggle={() =>
                            void broadcastAllEveTypesChannelPref(
                              applicableIds,
                              currentValue(),
                              types,
                              channel
                            )
                          }
                          label={t(`settings.notifications.selectAllCharactersFamily.${channel}`, {
                            family: familyLabel,
                          })}
                        />
                      </div>
                    ))}
                  </div>
                  <ul className="divide-y divide-line/60">
                    {types.map((type) => {
                      const typeLabel = eveTypeLabel(t, type);
                      return (
                        <AggregateRow
                          key={type}
                          tone="type"
                          label={typeLabel}
                          characters={context.characters}
                          availability={availability}
                          readValue={(id, channel) =>
                            isEveTypeEnabledFor(
                              characterEveTypePrefs(prefsValue, id),
                              type,
                              channel
                            )
                          }
                          onToggleAll={(ids, channel) =>
                            void broadcastEveTypeChannelPref(ids, currentValue(), type, channel)
                          }
                          onToggleOne={(id, channel) =>
                            toggleEveTypeChannelPref(id, currentValue(), type, channel)
                          }
                          browserBlocked={context.browserBlocked}
                          visibleCharacterIds={context.visibleCharacterIds}
                          forceExpanded={false}
                          // Always inline, even on a phone: a sheet over the Topic page loses the Back button.
                          isDesktop
                        />
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </li>
      )}
    </>
  );
}
