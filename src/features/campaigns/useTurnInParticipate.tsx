import { useTranslation } from 'react-i18next';
import { GrantCellMark } from '@/app/GrantCellMark';
import { usePermissionMark } from '@/app/usePermissionMark';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { participateLine, pileParticipate } from './turnInContent';
import { useParticipation } from './useTurnIns';

export function useTurnInCharacter(characterId: number | null | undefined): number | null {
  const active = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  return characterId === undefined ? active : characterId;
}

export function useTurnInParticipate(characterId: number | null, characterName?: string) {
  const { t } = useTranslation();
  const participation = useParticipation(characterId);
  const permission = usePermissionMark(characterId, { permission: 'militaryCampaigns' });
  const name = characterName ?? permission?.storedName ?? t('reauth.unknownCharacter');
  const ready = participation.status === 'ready' ? participation.data : null;
  return {
    name,
    participation: ready,
    lineFor: (objectiveId: string) =>
      participateLine({
        characterId,
        permission: permission?.status,
        state: ready?.stateOf(objectiveId),
      }),
    pile: pileParticipate({
      characterId,
      permission: permission?.status,
      answered: ready?.read.kind === 'ok',
    }),
    mark:
      characterId === null ? null : (
        <GrantCellMark
          characterId={characterId}
          characterName={name}
          permission="militaryCampaigns"
          why={t('campaigns.turnIn.whyParticipate', { name })}
        />
      ),
  };
}
