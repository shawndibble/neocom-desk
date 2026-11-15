/**
 * Under the Shared Moon Pop event (issue #6225): every corporation sharing moon pops with the
 * pilot, each with a Mute checkbox. A muted corporation stays listed after its pops end, so it
 * can always be unmuted. The list belongs to the account, not to a Character.
 */
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { resolveNames } from '@/features/character/names';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import type { CharacterRef } from './CharacterChipGrid';
import {
  mutedSharedPopCorporations,
  setSharedPopCorporationMuted,
  useNotificationPreferences,
  type NotificationPreferencesValue,
} from './preferences';
import { loadSharedPopsCached, sharingCorporationLabel } from './sharedPopsCache';

/** The sharing corporations, plus any already muted, with their names (best-effort). */
async function loadSharing(): Promise<{ ids: number[]; names: ReadonlyMap<number, string> }> {
  const pops = await loadSharedPopsCached();
  const muted = mutedSharedPopCorporations(useNotificationPreferences.getState().value);
  const ids = [...new Set([...pops.map((pop) => pop.corporationId), ...muted])];
  const names = await resolveNames(ids).catch(() => new Map<number, string>());
  return { ids, names };
}

export function SharedPopMutes({
  prefsValue,
  characters,
}: {
  prefsValue: NotificationPreferencesValue;
  characters: readonly CharacterRef[];
}) {
  const { t } = useTranslation();
  const sharing = useAsyncLoad(loadSharing);
  const muted = mutedSharedPopCorporations(prefsValue);
  const corporationIds = [...new Set([...(sharing.data?.ids ?? []), ...muted])].sort(
    (a, b) => a - b
  );
  const names = sharing.data?.names;

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
            corporation: sharingCorporationLabel(corporationId, names?.get(corporationId)),
          })}
        </label>
      ))}
    </fieldset>
  );
}
