import { divisionNamesToPush, type DivisionNames } from '@/engine/corpTaxBook/divisionNames';
import { loadCorporationDivisions } from '../wallet';
import { editBook, verifyOfficer, type BookSummary } from './bookClient';

export interface PushDivisionNamesDeps {
  load: typeof loadCorporationDivisions;
  edit: typeof editBook;
  verify: typeof verifyOfficer;
}

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
  if (!wallet) return false;
  const divisionNames = divisionNamesToPush(summary.divisions, summary.divisionNames, wallet);
  if (!divisionNames) return false;
  await deps.verify(characterId, corporationId);
  await deps.edit(characterId, corporationId, {
    action: 'updateSettings',
    patch: { divisionNames },
  });
  return true;
}
