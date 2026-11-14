/**
 * A Director's visit to the book stores the corp's wallet division names on it (#6161), so a
 * member's Settle up can name the Account to pick. Uses the Director's own corp login
 * (`canReadDivisions`), never the Corp Tax Book sync grant, and writes only when the names of
 * the book's divisions changed (`divisionNamesToPush`), so a visit normally costs one cached
 * ESI read and no write.
 */
import { divisionNamesToPush } from '@/engine/corpTaxBook/divisionNames';
import { loadCorporationDivisions } from '../wallet';
import { editBook, type BookSummary } from './bookClient';

export interface PushDivisionNamesDeps {
  load: typeof loadCorporationDivisions;
  edit: typeof editBook;
}

/** Whether it wrote. Throws what the read or the write threw; the caller logs it. */
export async function pushDivisionNames(
  characterId: number,
  corporationId: number,
  summary: Pick<BookSummary, 'divisions' | 'divisionNames'>,
  deps: PushDivisionNamesDeps = { load: loadCorporationDivisions, edit: editBook }
): Promise<boolean> {
  const result = await deps.load(characterId, corporationId, true);
  const wallet = result.cached?.data.wallet;
  // No answer (or an answer without the wallet half) says nothing about the names: keep them.
  if (!wallet) return false;
  const divisionNames = divisionNamesToPush(summary.divisions, summary.divisionNames, wallet);
  if (!divisionNames) return false;
  await deps.edit(characterId, corporationId, {
    action: 'updateSettings',
    patch: { divisionNames },
  });
  return true;
}
