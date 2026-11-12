/**
 * The rows `VettingCharacterList` draws, for the two pages that have one: an applicant's draft
 * and a member's review request. Pure.
 */
import type { VettingStatus } from '@/engine/vetting';
import type { VettingCharacterRow } from './VettingCharacterList';
import { missingSourcesFor } from './vettingView';

/** Rows as the list draws them: what the server read, with the one being read now marked. */
export function applicationRows(
  status: VettingStatus | null,
  reading: { characterId: number; name: string } | null
): VettingCharacterRow[] {
  const rows: VettingCharacterRow[] = (status?.characters ?? []).map((character) => ({
    characterId: character.characterId,
    name: character.name,
    corporationName: character.corporationName,
    state:
      reading?.characterId === character.characterId
        ? 'reading'
        : character.missing.length > 0
          ? 'partMissing'
          : 'read',
    missing: character.missing,
  }));
  if (reading && !rows.some((row) => row.characterId === reading.characterId)) {
    rows.push({ characterId: reading.characterId, name: reading.name, state: 'reading' });
  }
  return rows;
}

/** The device's characters and anything already read, as the list draws them. */
export function requestRows(
  characters: readonly { characterId: number; name: string }[],
  scopesById: ReadonlyMap<number, readonly string[]>,
  status: VettingStatus,
  readingId: number | null
): VettingCharacterRow[] {
  const read = new Map(status.characters.map((character) => [character.characterId, character]));
  const rows: VettingCharacterRow[] = characters.map((character) => {
    const done = read.get(character.characterId);
    if (readingId === character.characterId) {
      return { characterId: character.characterId, name: character.name, state: 'reading' };
    }
    if (done) {
      return {
        characterId: done.characterId,
        name: done.name,
        corporationName: done.corporationName,
        state: done.missing.length > 0 ? 'partMissing' : 'read',
        missing: done.missing,
      };
    }
    const missing = missingSourcesFor(scopesById.get(character.characterId) ?? []);
    return {
      characterId: character.characterId,
      name: character.name,
      state: missing.length > 0 ? 'needsSignIn' : 'ready',
      missing,
    };
  });
  // A character signed in for this review that is not on the device.
  for (const done of status.characters) {
    if (characters.some((character) => character.characterId === done.characterId)) continue;
    rows.push({
      characterId: done.characterId,
      name: done.name,
      corporationName: done.corporationName,
      state: done.missing.length > 0 ? 'partMissing' : 'read',
      missing: done.missing,
    });
  }
  return rows;
}
