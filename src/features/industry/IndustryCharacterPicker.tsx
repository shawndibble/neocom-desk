import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { useAccountCharacters } from '@/features/character/useCharacters';
import { useIndustryCharacterFilter } from './industryCharacterFilter';

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
