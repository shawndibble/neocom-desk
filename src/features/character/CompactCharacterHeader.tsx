import type { ReactNode } from 'react';
import { AlertsBell } from '@/components/ui';
import { CharacterIdentity, CharacterPortrait } from './CharacterIdentity';
import { useCharacterIdentity } from './useCharacterIdentity';

interface CompactCharacterHeaderProps {
  characterId: number;
  corner?: ReactNode;
  below?: ReactNode;
}

export function CompactCharacterHeader({
  characterId,
  corner,
  below,
}: CompactCharacterHeaderProps) {
  const identity = useCharacterIdentity(characterId);
  return (
    <header className="space-y-2">
      <div className="flex items-start gap-3">
        <CharacterPortrait characterId={characterId} name={identity.name} />
        <div className="min-w-0 flex-1">
          <CharacterIdentity characterId={characterId} identity={identity} wrapping />
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <AlertsBell showWhenEmpty />
          {corner}
        </div>
      </div>
      {below}
    </header>
  );
}
