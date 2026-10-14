/**
 * An event's warn-ahead times, one set per Character: thresholds are saved per
 * Character (`preferences.ts`), so the event-first page lists them under the
 * chips instead of repeating them on every row. Closed by default, and only
 * for Characters the event applies to and has switched on.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret } from '@/components/ui';
import { focusRingInsetClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
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
  /** Already narrowed to Characters the event applies to and has on. */
  characters: readonly CharacterRef[];
  prefsValue: NotificationPreferencesValue;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (characters.length === 0) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cx(
          'flex min-h-11 items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase hover:text-text md:min-h-0',
          interactiveClassName,
          focusRingInsetClassName
        )}
      >
        <Caret expanded={open} />
        {t('settings.notifications.warnAheadTimes', { count: characters.length })}
      </button>
      {open && (
        <ul className="space-y-2">
          {characters.map((character) => (
            <li key={character.characterId} className="space-y-1">
              <p className="text-xs text-text">{character.name}</p>
              <ThresholdControls
                characterId={character.characterId}
                thresholds={thresholds}
                values={characterEventThresholds(prefsValue, character.characterId)}
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
      )}
    </div>
  );
}
