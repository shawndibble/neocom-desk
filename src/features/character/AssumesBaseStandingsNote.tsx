import { useTranslation } from 'react-i18next';
import { ReauthBanner } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import { permissionsForEndpoints, type EsiEndpointId } from '@/esi/registry';

/** Stable reference for `useEndpointsGranted` — a fresh array every render would defeat its memo. */
const STANDINGS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterStandings'];

interface AssumesBaseStandingsNoteProps {
  /** Which figure is degraded, in the surface's own words. */
  hint: string;
  /** Whose standings price the figure; the active Character when omitted. */
  characterId?: number | null;
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
  const granted = useEndpointsGranted(STANDINGS_ENDPOINTS, characterId);
  if (granted !== false) return null;
  return (
    <div className={className}>
      <ReauthBanner
        variant="ghost"
        title={
          characterName
            ? t('character.assumesBaseStandings.titleFor', { character: characterName })
            : t('character.assumesBaseStandings.title')
        }
        hint={hint}
        actionLabel={t('character.assumesBaseStandings.action')}
        // The figure's own Character: `beginEveLogin` otherwise merges in the
        // active Character's grant, and SSO issues exactly what was requested.
        onLogin={() =>
          void beginEveLogin({
            characterId: characterId ?? undefined,
            groups: permissionsForEndpoints(STANDINGS_ENDPOINTS),
          })
        }
      />
    </div>
  );
}
