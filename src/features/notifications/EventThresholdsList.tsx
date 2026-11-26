import { useTranslation } from 'react-i18next';
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
  return (
    <div className="space-y-2">
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
  );
}
