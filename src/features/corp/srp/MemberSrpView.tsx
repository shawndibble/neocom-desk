import { useTranslation } from 'react-i18next';
import { EmptyState, Panel, Spinner } from '@/components/ui';
import { useActiveCorporationIdState } from '@/features/corp/owner';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { MemberSrp } from './MemberSrp';

/** The member filing view with its Character and corporation resolved; no Corp Access involved. */
export function MemberSrpView() {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const corporationId = useActiveCorporationIdState();
  if (characterId === null || corporationId === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
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
