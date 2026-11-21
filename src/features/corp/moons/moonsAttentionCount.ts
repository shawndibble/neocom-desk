/**
 * The Moons nav dot's Needs you count, read in the background (#6208): the Overview's
 * read of the book (`bookPartsFor('overview')`), joined and counted as the Overview counts
 * it (`needsYouOf`). Loaded on demand by the shell's poll, so the shell bundle stays light.
 *
 * The read reuses this device's copy of each part whose version stamp has not moved
 * (bookCache.ts) and reads the ledger rows as a delta (ADR 0031): an unchanged book costs
 * its settings doc and `meta/paid`. Its prices are the ones this session already loaded
 * (`cachedBookPrices`): a recount loads the market only when none held cover the book's ores.
 */
import { buildBookView } from '@/engine/corpTaxBook/bookView';
import { tabsProjection } from '@/engine/corpTaxBook/readModels';
import { loadCurrentMemberIds } from '../currentMembers';
import { bookPartsFor, readBook } from '../taxBook/bookRead';
import { bookViewInputOf, cachedBookPrices } from './bookViewOf';
import { needsYouOf } from './useNeedsYou';

/** The book's Needs you count now; null when the corporation has no active book. */
export async function loadNeedsYouCount(
  characterId: number,
  corporationId: number
): Promise<number | null> {
  const data = await readBook(characterId, corporationId, { parts: bookPartsFor('overview') });
  if (!data?.settings.active) return null;
  const memberIds = await loadCurrentMemberIds(
    [
      ...data.observed.map((r) => r.characterId),
      ...data.state.miners.flatMap((m) => m.characterIds),
    ],
    corporationId
  ).catch(() => undefined);
  const prices = await cachedBookPrices(data);
  const view = buildBookView(
    bookViewInputOf(corporationId, new Date().toISOString(), data, prices, { memberIds })
  );
  const { needsYou } = tabsProjection(view);
  return needsYouOf(view, data, data.settings.divisions, needsYou, data.settings.noticeRules).count;
}
