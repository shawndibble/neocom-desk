import {
  buildQuote,
  type PastedItem,
  type QuoteResult,
  type StandingRequest,
} from '@/engine/communities/buyback';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import { matchAppraisalEntries } from '@/engine/market/appraisalMatch';
import { loadAppraisalCatalogue } from '@/features/market/appraisalData';
import { TRADE_HUBS } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';

export interface PileQuote extends QuoteResult {
  unmatched: string[];
}

export async function quotePile(
  text: string,
  standing: StandingRequest,
  now: number
): Promise<PileQuote> {
  const [catalogue, types, groupCategories] = await Promise.all([
    loadAppraisalCatalogue(),
    loadTypes(),
    loadGroupCategories(),
  ]);
  const { matched, unmatched } = matchAppraisalEntries(parseAppraisalPaste(text), catalogue);
  const items = matched.map((match): PastedItem => {
    const groupId = types[String(match.typeId)]?.groupID ?? null;
    return {
      typeId: match.typeId,
      name: match.name,
      quantity: match.quantity,
      groupId,
      categoryId: groupId === null ? null : (groupCategories[String(groupId)] ?? null),
    };
  });
  const hub = TRADE_HUBS.find((h) => h.id === standing.hubId);
  if (!hub) throw new Error(`Unknown Trade Hub ${standing.hubId}`);
  const prices =
    items.length === 0
      ? new Map()
      : await getHubPrices(
          hub,
          items.map((item) => item.typeId)
        );
  return { ...buildQuote(items, standing, prices, now), unmatched: unmatched.map((u) => u.name) };
}
