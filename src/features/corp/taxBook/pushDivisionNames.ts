/**
 * A Director's visit to the book stores the corp's wallet division names on it (#6161), so a
 * member's Settle up can name the Account to pick. Uses the Director's own corp login
 * (`canReadDivisions`), never the Corp Tax Book sync grant, and writes only when the names of
 * the book's divisions changed (`divisionNamesToPush`), so a visit normally costs one cached
 * ESI read and no write.
 */
import { divisionNamesToPush, type DivisionNames } from '@/engine/corpTaxBook/divisionNames';
import { loadCorporationDivisions } from '../wallet';
import { editBook, verifyOfficer, type BookSummary } from './bookClient';

export interface PushDivisionNamesDeps {
  load: typeof loadCorporationDivisions;
  edit: typeof editBook;
  verify: typeof verifyOfficer;
}

/**
 * The names to send with a settings change that sets the book's `divisions`, so a member sees a
 * newly read division by the corp's name at once rather than after a Director's next visit. Null
 * when they are unchanged, when none of them is named, or when the names could not be read (no
 * role, ESI down): the stored names then stay as they are. Only a Director's visit clears them.
 */
export async function divisionNamesFor(
  characterId: number,
  corporationId: number,
  canReadDivisions: boolean,
  divisions: readonly number[],
  stored: Readonly<DivisionNames> | undefined,
  load: typeof loadCorporationDivisions = loadCorporationDivisions
): Promise<DivisionNames | null> {
  const result = await load(characterId, corporationId, canReadDivisions).catch(() => null);
  const wallet = result?.cached?.data.wallet;
  const names = wallet ? divisionNamesToPush(divisions, stored, wallet) : null;
  return names && Object.keys(names).length > 0 ? names : null;
}

/** Whether it wrote. Throws what the read or the write threw; the caller logs it. */
export async function pushDivisionNames(
  characterId: number,
  corporationId: number,
  summary: Pick<BookSummary, 'divisions' | 'divisionNames'>,
  deps: PushDivisionNamesDeps = {
    load: loadCorporationDivisions,
    edit: editBook,
    verify: verifyOfficer,
  }
): Promise<boolean> {
  const result = await deps.load(characterId, corporationId, true);
  const wallet = result.cached?.data.wallet;
  // No answer (or an answer without the wallet half) says nothing about the names: keep them.
  if (!wallet) return false;
  const divisionNames = divisionNamesToPush(summary.divisions, summary.divisionNames, wallet);
  if (!divisionNames) return false;
  // The write rides on the role the officer check caches; this runs beside the book's own load,
  // so it may come first, and without the check the server answers 403.
  await deps.verify(characterId, corporationId);
  await deps.edit(characterId, corporationId, {
    action: 'updateSettings',
    patch: { divisionNames },
  });
  return true;
}
