import { Navigate } from 'react-router-dom';
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { MemberSrpView } from '@/features/corp/srp/MemberSrpView';
import { useActiveCharacter } from '@/stores/activeCharacter';

export function Srp() {
  const hydrated = useActiveCharacter((s) => s.hydrated);
  const activeCharacterId = useActiveCharacter((s) => s.activeCharacterId);
  if (hydrated && activeCharacterId === null) return <Navigate to="/characters" replace />;
  return (
    <div className="mx-auto max-w-page space-y-4">
      {activeCharacterId !== null && <CharacterHeader characterId={activeCharacterId} />}
      <OverviewSubNav />
      <MemberSrpView />
    </div>
  );
}
