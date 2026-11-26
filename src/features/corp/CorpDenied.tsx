import { useTranslation } from 'react-i18next';
import { Button, EmptyState, NeedsConnection } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { npcCorporationText, useActiveNpcCorporation } from './useActiveNpcCorporation';
import type { CorpDenialReason } from './useCorpRouteGate';

interface CorpDeniedProps {
  reason: CorpDenialReason;
  title: string;
  hint: string;
  roleLine: string;
}

export function CorpDenied({ reason, title, hint, roleLine }: CorpDeniedProps) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const npc = useActiveNpcCorporation();

  if (npc != null) {
    return <EmptyState title={t('corp.officerPagesTitle')} hint={npcCorporationText(t, npc)} />;
  }
  const grantable = reason === 'not-granted' || reason === 'roles-without-grant';
  if (!grantable || activeCharacterId === null) return <EmptyState title={title} hint={hint} />;
  if (npc === undefined) return null;

  return (
    <EmptyState
      title={t('corp.officerPagesTitle')}
      hint={t('corp.notGrantedHint', { roles: roleLine })}
      action={
        <NeedsConnection>
          <Button
            variant="primary"
            onClick={() => void beginEveLogin({ characterId: activeCharacterId, groups: ['corp'] })}
          >
            {t('corp.notGrantedAction')}
          </Button>
        </NeedsConnection>
      }
    />
  );
}
