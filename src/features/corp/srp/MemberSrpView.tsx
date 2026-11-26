import { useTranslation } from 'react-i18next';
import { EmptyState, Panel, Spinner } from '@/components/ui';
import { useActiveCorporationIdState } from '@/features/corp/owner';
import {
  npcCorporationText,
  useActiveNpcCorporation,
} from '@/features/corp/useActiveNpcCorporation';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { MemberSrp } from './MemberSrp';

export function MemberSrpView() {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const corporationId = useActiveCorporationIdState();
  const npc = useActiveNpcCorporation();
  if (characterId === null || corporationId === undefined || npc === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (npc) {
    return (
      <Panel>
        <EmptyState
          title={t('srpMember.npcTitle')}
          hint={npcCorporationText(t, npc, 'srpMember.npcCorporation')}
        />
      </Panel>
    );
  }
  if (corporationId === null) {
    return (
      <Panel>
        <EmptyState title={t('srpMember.notSetUp.title')} hint={t('srpMember.notSetUp.hint')} />
      </Panel>
    );
  }
  return <MemberSrp characterId={characterId} corporationId={corporationId} />;
}
