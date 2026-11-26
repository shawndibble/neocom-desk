import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, LiveStatus } from '@/components/ui';
import { readLocal, writeLocal } from '@/lib/safeLocalStorage';
import type { EsiEndpointId } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { GrantBanner } from './GrantNote';
import { useCharacterLacksEndpoints } from './useGrantedScopes';

const STANDINGS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterStandings'];

const dismissKey = (characterId: number) => `standingsScopeNoticeDismissed:${characterId}`;

function readDismissed(characterId: number): boolean {
  return readLocal(dismissKey(characterId)) === '1';
}

function writeDismissed(characterId: number): void {
  writeLocal(dismissKey(characterId), '1');
}

export function StandingsScopeNotice() {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((state) =>
    state.hydrated ? state.activeCharacterId : null
  );
  const lacks = useCharacterLacksEndpoints(characterId, STANDINGS_ENDPOINTS);
  const [dismissedNow, setDismissedNow] = useState<number | null>(null);

  if (!lacks || characterId === null) return null;
  if (dismissedNow === characterId || readDismissed(characterId)) return null;

  return (
    <div className="mb-4 rounded-xs border border-warning/40 bg-panel px-3 py-1">
      <LiveStatus>{t('reauth.standingsTitle')}</LiveStatus>
      <GrantBanner
        standalone
        characterId={characterId}
        endpoints={STANDINGS_ENDPOINTS}
        title={t('reauth.standingsTitle')}
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
