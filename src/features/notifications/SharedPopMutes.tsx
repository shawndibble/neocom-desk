/**
 * Under the Shared Moon Pop event (issue #6225): every corporation sharing moon pops with the
 * pilot, each with a Mute checkbox. A muted corporation stays listed after its pops end, so it
 * can always be unmuted. The list belongs to the account, not to a Character.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { resolveNames } from '@/features/character/names';
import type { CharacterRef } from './CharacterChipGrid';
import {
  mutedSharedPopCorporations,
  setSharedPopCorporationMuted,
  type NotificationPreferencesValue,
} from './preferences';
import { loadSharedPopsCached } from './sharedPopsCache';

export function SharedPopMutes({
  prefsValue,
  characters,
}: {
  prefsValue: NotificationPreferencesValue;
  characters: readonly CharacterRef[];
}) {
  const { t } = useTranslation();
  const [sharing, setSharing] = useState<readonly number[]>([]);
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  const muted = mutedSharedPopCorporations(prefsValue);

  useEffect(() => {
    let live = true;
    loadSharedPopsCached()
      .then((pops) => {
        if (live) setSharing([...new Set(pops.map((pop) => pop.corporationId))]);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const corporationIds = [...new Set([...sharing, ...muted])].sort((a, b) => a - b);
  const idsKey = corporationIds.join(',');
  useEffect(() => {
    if (idsKey === '') return;
    let live = true;
    resolveNames(idsKey.split(',').map(Number))
      .then((resolved) => {
        if (live) setNames(resolved);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [idsKey]);

  if (corporationIds.length === 0) return null;
  const characterIds = characters.map((character) => character.characterId);
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-[0.6875rem] text-text-dim">
        {t('settings.notifications.sharedMoonPopMutes')}
      </legend>
      {corporationIds.map((corporationId) => (
        <label
          key={corporationId}
          className={`${tappableRowClassName} flex items-center gap-2 text-xs`}
        >
          <Checkbox
            checked={muted.has(corporationId)}
            onChange={(e) =>
              void setSharedPopCorporationMuted(characterIds, corporationId, e.target.checked)
            }
          />
          {t('settings.notifications.sharedMoonPopMuteLabel', {
            corporation: names.get(corporationId) ?? `#${corporationId}`,
          })}
        </label>
      ))}
    </fieldset>
  );
}
