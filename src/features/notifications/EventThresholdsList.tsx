/**
 * An event's warn-ahead times, one set per Character: thresholds are saved per
 * Character (`preferences.ts`), so the event-first page lists them under the
 * chips instead of repeating them on every row. Closed by default, and only
 * for the Characters the caller passes (those the event applies to and has on).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui/Disclosure';
import { ThresholdControls } from './EventThresholds';
import type { EventThresholds } from './eventEntries';
import {
  characterEventThresholds,
  updateNotificationPrefs,
  useNotificationPreferences,
  withCharacterEventThreshold,
  type NotificationPreferencesValue,
} from './preferences';
import type { CharacterRef } from './CharacterChipGrid';

export function EventThresholdsList({
  thresholds,
  characters,
  prefsValue,
}: {
  thresholds: EventThresholds;
  characters: readonly CharacterRef[];
  prefsValue: NotificationPreferencesValue;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (characters.length === 0) return null;
  return (
    <Disclosure
      label={
        thresholds.headingKey === undefined
          ? t('settings.notifications.warnAheadTimes', { count: characters.length })
          : t(thresholds.headingKey)
      }
      expanded={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <div className="space-y-2 pt-1">
        {thresholds.hintKey !== null && (
          <p className="text-[0.6875rem] text-text-dim">{t(thresholds.hintKey)}</p>
        )}
        <ul className="grid grid-cols-[minmax(0,max-content)_1fr] items-center gap-x-4 gap-y-2">
          {characters.map((character) => (
            <li
              key={character.characterId}
              className="col-span-2 grid grid-cols-subgrid items-center"
            >
              <p className="text-xs text-text">{character.name}</p>
              <ThresholdControls
                characterId={character.characterId}
                thresholds={thresholds}
                values={characterEventThresholds(prefsValue, character.characterId)}
                showHint={false}
                onChange={(key, amount) =>
                  void updateNotificationPrefs(
                    character.characterId,
                    withCharacterEventThreshold(
                      useNotificationPreferences.getState().value,
                      character.characterId,
                      key,
                      amount
                    )
                  )
                }
              />
            </li>
          ))}
        </ul>
      </div>
    </Disclosure>
  );
}
