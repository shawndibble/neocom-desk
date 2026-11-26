import { CharacterLink } from '@/features/entities';
import { characterCell } from '@/features/settings/activityLogCsv';

export function CharacterNameCell({
  characterId,
  characterNames,
  t,
}: {
  characterId: number | undefined;
  characterNames: ReadonlyMap<number, string>;
  t: (key: string) => string;
}) {
  const label = characterCell(characterId, characterNames, t);
  return characterId === undefined ? (
    label
  ) : (
    <CharacterLink id={characterId}>{label}</CharacterLink>
  );
}
