import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { useAccountCharacters } from '@/features/character/useCharacters';
import { useIndustryCharacterFilter } from './industryCharacterFilter';

/**
 * Industry's one Character picker, driving Active Jobs and Build
 * Opportunities (Ranked and All owned) together. Both panels list the same
 * account Characters, so one candidate count gates it: hidden for a
 * one-Character account, where This and All are the same pilot.
 */
export function IndustryCharacterPicker({ activeCharacterId }: { activeCharacterId: number }) {
  const { candidates } = useAccountCharacters();
  const [value, setValue] = useIndustryCharacterFilter();
  if (candidates.length < 2) return null;
  return (
    <CharacterFilterControl
      activeCharacterId={activeCharacterId}
      value={value}
      onChange={setValue}
      characterCount={candidates.length}
    />
  );
}
