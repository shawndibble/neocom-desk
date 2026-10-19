import { CharacterLink } from '@/features/entities';
import { characterCell } from '@/features/settings/activityLogCsv';

/** The Character column: a Show Info link, or plain text for a public (character-less) call. */
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
