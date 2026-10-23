/** `/corp/srp`: one role-aware page. No Corp Access gate; the corp comes from public affiliation. */
import { useTranslation } from 'react-i18next';
import { EmptyState, PageHeader, Spinner } from '@/components/ui';
import { useActiveCorporationIdState } from '@/features/corp/owner';
import { MemberSrp } from '@/features/corp/srp/MemberSrp';
import { srpViewFor } from '@/features/corp/srp/srpView';
import { useActiveCharacter } from '@/stores/activeCharacter';

export function CorpSrp() {
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
      <div className="mx-auto max-w-5xl space-y-4">
        <PageHeader title={t('srpMember.title')} />
        <EmptyState title={t('srpMember.notSetUp.title')} hint={t('srpMember.notSetUp.hint')} />
      </div>
    );
  }
  switch (srpViewFor()) {
    case 'member':
      return <MemberSrp characterId={characterId} corporationId={corporationId} />;
  }
}
