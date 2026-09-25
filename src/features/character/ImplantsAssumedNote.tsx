import { useTranslation } from 'react-i18next';
import { ReauthBanner } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { useCharactersLackingEndpoints } from '@/app/useGrantedScopes';
import { permissionsForEndpoints, type EsiEndpointId } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';

/** Stable references for `useCharactersLackingEndpoints` — fresh arrays every render would re-run its query. */
const IMPLANTS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterImplants'];
const NO_IDS: readonly number[] = [];

interface ImplantsAssumedNoteProps {
  /** Names the figure that was computed without implants, and what granting fixes. */
  hint: string;
  /** Whose grant decides it — the active Character when omitted. */
  characterId?: number;
}

/**
 * The inline "assumes no implants" note for a figure that silently fell back
 * to an empty implant set because its Character never granted Character
 * details (issues #1526, #1588). Renders nothing while the grant is still
 * unknown, so it never flashes on a cold load, and nothing once it's granted.
 * The caller decides whether the figure is on screen and implant-sensitive.
 */
export function ImplantsAssumedNote({ hint, characterId }: ImplantsAssumedNoteProps) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) =>
    state.hydrated ? state.activeCharacterId : null
  );
  const id = characterId ?? activeCharacterId;
  const lacking = useCharactersLackingEndpoints(id === null ? NO_IDS : [id], IMPLANTS_ENDPOINTS);
  // `includes(id)`, not `length`: right after `id` changes the query still
  // holds the previous Character's answer for a frame.
  if (id === null || !lacking?.includes(id)) return null;

  return (
    <ReauthBanner
      variant="ghost"
      title={t('reauth.implantsAssumedTitle')}
      hint={hint}
      actionLabel={t('reauth.implantsAssumedAction')}
      onLogin={() =>
        void beginEveLogin({
          characterId: id,
          groups: permissionsForEndpoints(IMPLANTS_ENDPOINTS),
        })
      }
    />
  );
}
