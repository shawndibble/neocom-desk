import { createLocalSetting } from '@/lib/useLocalSetting';

export const STARRED_CHARACTERS_SETTING_KEY = 'characters.starred';

export const NO_STARRED_CHARACTERS: readonly number[] = [];

export function parseStarredCharacters(raw: unknown): readonly number[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every((id) => typeof id === 'number' && Number.isInteger(id))) return null;
  return raw as number[];
}

export function isCharacterStarred(starred: readonly number[], characterId: number): boolean {
  return starred.includes(characterId);
}

export function withToggledStar(starred: readonly number[], characterId: number): number[] {
  return isCharacterStarred(starred, characterId)
    ? starred.filter((id) => id !== characterId)
    : [...starred, characterId];
}

export function pruneStarredCharacters(
  starred: readonly number[],
  existingCharacterIds: ReadonlySet<number>
): number[] {
  return starred.filter((id) => existingCharacterIds.has(id));
}

export function starredCharactersNeedPruning(
  starred: readonly number[],
  existingCharacterIds: ReadonlySet<number>
): boolean {
  return starred.some((id) => !existingCharacterIds.has(id));
}

export function partitionStarredFirst(
  characterIds: readonly number[],
  starred: readonly number[]
): number[] {
  const starredIds = new Set(starred);
  return [
    ...characterIds.filter((id) => starredIds.has(id)),
    ...characterIds.filter((id) => !starredIds.has(id)),
  ];
}

export const useStarredCharacters = createLocalSetting<readonly number[]>({
  key: STARRED_CHARACTERS_SETTING_KEY,
  defaultValue: NO_STARRED_CHARACTERS,
  parse: parseStarredCharacters,
});
