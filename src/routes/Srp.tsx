/**
 * `/srp` (ADR 0026): a pilot's own SRP, file a claim, lost ships and My
 * claims, the third sub-view of the personal Overview. No Corp Access and no corp scope: any
 * pilot of an SRP corporation files. The sub-nav lists it only while the corporation has SRP on
 * (`NavSubView.visible`); typing the path with SRP off shows the "not set up" state, not a 404.
 */
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
    <div className="mx-auto max-w-6xl space-y-4">
      {activeCharacterId !== null && <CharacterHeader characterId={activeCharacterId} />}
      <OverviewSubNav />
      <div className="mx-auto max-w-5xl">
        <MemberSrpView />
      </div>
    </div>
  );
}
