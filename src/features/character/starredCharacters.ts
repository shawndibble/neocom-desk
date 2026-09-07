/**
 * Starred Characters (CONTEXT.md): the Characters the user has pinned to the
 * top of the Characters page. Device-local, like the groupings they sort
 * inside — a star is a statement about the roster rather than about any one
 * Character, so it cannot live under a single Character's sync scope, and EVE
 * SSO offers no account identity to hang it on (see `overviewGroups.ts`).
 *
 * User-created content, not view state: nothing clears a star but the user
 * pressing it again, and the only id that ever leaves on its own is one whose
 * Character is no longer on this device (`pruneStarredCharacters`).
 *
 * One `createLocalSetting` key holding an array of Character ids — the shape
 * `corp/assetsExpandPreference.ts` uses, `parse` included: a stored value
 * that is not an array of Character ids is rejected whole rather than
 * salvaged, so a half-understood row falls back to "nothing starred" instead
 * of throwing the page away.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const STARRED_CHARACTERS_SETTING_KEY = 'characters.starred';

/** Nothing starred — named so callers and tests never hand-roll a second empty array. */
export const NO_STARRED_CHARACTERS: readonly number[] = [];

/**
 * Character ids are whole numbers, so a fractional or `NaN` member is as much
 * a sign of a damaged row as a string is — all three reject the whole value.
 */
export function parseStarredCharacters(raw: unknown): readonly number[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every((id) => typeof id === 'number' && Number.isInteger(id))) return null;
  return raw as number[];
}

export function isCharacterStarred(starred: readonly number[], characterId: number): boolean {
  return starred.includes(characterId);
}

/** Stars `characterId` when it isn't, unstars it when it is. Never mutates `starred`. */
export function withToggledStar(starred: readonly number[], characterId: number): number[] {
  return isCharacterStarred(starred, characterId)
    ? starred.filter((id) => id !== characterId)
    : [...starred, characterId];
}

/** Drops ids whose Character is no longer on this device. */
export function pruneStarredCharacters(
  starred: readonly number[],
  existingCharacterIds: ReadonlySet<number>
): number[] {
  return starred.filter((id) => existingCharacterIds.has(id));
}

/** True if pruning would change anything — lets a caller skip a no-op write. */
export function starredCharactersNeedPruning(
  starred: readonly number[],
  existingCharacterIds: ReadonlySet<number>
): boolean {
  return starred.some((id) => !existingCharacterIds.has(id));
}

/**
 * Starred ids first, the rest after, each half in the order it arrived.
 *
 * A partition layered on top of the caller's sort, not a replacement for it:
 * whichever key and direction the user picked still decides the order inside
 * both halves, so starring a Character raises it without scrambling anything
 * around it.
 */
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
