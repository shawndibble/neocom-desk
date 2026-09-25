import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { EsiEndpointId } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { GrantBanner } from './GrantNote';
import { useCharacterLacksEndpoints } from './useGrantedScopes';

const STANDINGS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterStandings'];

const dismissKey = (characterId: number) => `standingsScopeNoticeDismissed:${characterId}`;

function readDismissed(characterId: number): boolean {
  try {
    return localStorage.getItem(dismissKey(characterId)) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(characterId: number): void {
  try {
    localStorage.setItem(dismissKey(characterId), '1');
  } catch {
    // Storage blocked: the notice just comes back next load.
  }
}

/**
 * Shell-level prompt for an active Character whose login predates
 * `esi-characters.read_standings.v1` (issue #1238). Without the scope every
 * NPC-station broker fee assumes 0 standing, so the app silently overstates
 * fees for anyone with real standings.
 *
 * Driven by the stored grant rather than a live 401/403: `esi/cache.ts`'s
 * `isWorthReportingToShell` deliberately stays silent for a scope the grant
 * never claimed, so `AuthFailureNotice` can never fire for this case.
 *
 * Dismissible per Character (persisted) so it is a one-time nudge, not a
 * nag; the Appraisal panel keeps its own inline note.
 */
export function StandingsScopeNotice() {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((state) =>
    state.hydrated ? state.activeCharacterId : null
  );
  const lacks = useCharacterLacksEndpoints(characterId, STANDINGS_ENDPOINTS);
  // Remembers which Character was dismissed this session, so the write to
  // storage is not needed to hide it immediately.
  const [dismissedNow, setDismissedNow] = useState<number | null>(null);

  if (!lacks || characterId === null) return null;
  if (dismissedNow === characterId || readDismissed(characterId)) return null;

  return (
    <div role="status" className="mb-4 rounded-xs border border-warning/40 bg-panel px-3 py-1">
      <GrantBanner
        characterId={characterId}
        endpoints={STANDINGS_ENDPOINTS}
        title={t('reauth.standingsTitle')}
        hint={t('reauth.standingsHint')}
        actionLabel={t('reauth.standingsAction')}
        // Renders above a route that may have its own primary button
        // (docs/DESIGN.md §5, one per view).
        variant="ghost"
      />
      <div className="pb-2">
        <Button
          size="sm"
          onClick={() => {
            writeDismissed(characterId);
            setDismissedNow(characterId);
          }}
        >
          {t('reauth.dismiss')}
        </Button>
      </div>
    </div>
  );
}
