import { buildBookView } from '@/engine/corpTaxBook/bookView';
import { loadCurrentMemberIds } from '../currentMembers';
import { bookPartsFor, readBook } from '../taxBook/bookRead';
import { bookViewInputOf, cachedBookPrices } from './bookViewOf';
import { needsYouOf } from './useNeedsYou';

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
  return needsYouOf(view, data, data.settings.divisions, data.settings.noticeRules).count;
}
