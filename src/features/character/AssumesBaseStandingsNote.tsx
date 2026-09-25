import { useTranslation } from 'react-i18next';
import { ReauthBanner } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { useCharactersLackingEndpoints } from '@/app/useGrantedScopes';
import { permissionsForEndpoints, type EsiEndpointId } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';

/** Stable references for `useCharactersLackingEndpoints` — fresh arrays every render would re-run its query. */
const STANDINGS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterStandings'];
const NO_IDS: readonly number[] = [];

interface AssumesBaseStandingsNoteProps {
  /** Which figure is degraded, in the surface's own words. */
  hint: string;
  /** Whose standings price the figure; the active Character when omitted. */
  characterId?: number;
  /** Prefixed onto the title where several characters' notes can stack. */
  characterName?: string;
  className?: string;
}

/**
 * The inline "assumes base standings" note (issues #1526, #1589): a broker fee
 * priced without the Character details Permission silently falls back to 0
 * standing (`features/character/standings.ts`), so the figure says so and
 * offers the grant. Renders nothing while the grant is unknown or once it's
 * held — callers only decide whether a fee figure is on screen at all.
 */
export function AssumesBaseStandingsNote({
  hint,
  characterId,
  characterName,
  className,
}: AssumesBaseStandingsNoteProps) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) =>
    state.hydrated ? state.activeCharacterId : null
  );
  const id = characterId ?? activeCharacterId;
  const lacking = useCharactersLackingEndpoints(id === null ? NO_IDS : [id], STANDINGS_ENDPOINTS);
  // `includes(id)`, not `length`: right after `id` changes the query still
  // holds the previous Character's answer for a frame.
  if (id === null || !lacking?.includes(id)) return null;
  return (
    <div className={className}>
      <ReauthBanner
        variant="ghost"
        title={
          characterName
            ? t('reauth.standingsAssumedTitleFor', { character: characterName })
            : t('reauth.standingsAssumedTitle')
        }
        hint={hint}
        actionLabel={t('reauth.standingsAssumedAction')}
        // The figure's own Character: `beginEveLogin` otherwise merges in the
        // active Character's grant, and SSO issues exactly what was requested.
        onLogin={() =>
          void beginEveLogin({
            characterId: id,
            groups: permissionsForEndpoints(STANDINGS_ENDPOINTS),
          })
        }
      />
    </div>
  );
}
