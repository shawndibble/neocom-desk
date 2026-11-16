/**
 * The `BookView` a book read joins into, outside React too: `useCorpBook` builds the page's view
 * with it, and the Moons nav dot's background poll (`moonsAttentionCount.ts`) the same one.
 */
import type { BookViewInput } from '@/engine/corpTaxBook/bookView';
import { groupObservedEntries } from '@/engine/corpTaxBook/observed';
import { utcDay } from '@/engine/localDay';
import {
  hubForPayee,
  loadDatedUnitPricesByHub,
  moonOwnerPricesAtHubOnDate,
  pricesAtHubOnDate,
  sourcesAtHubOnDate,
} from '@/features/miningTax/pricing';
import type { BookData } from '../taxBook/bookClient';

export type BookPrices = Awaited<ReturnType<typeof loadBookPrices>>;

/** The view's input from a book read, its prices and what the page learned beside it. */
export function bookViewInputOf(
  corporationId: number,
  now: string,
  data: BookData,
  prices: BookPrices,
  extra: Pick<BookViewInput, 'memberIds' | 'surveyOreLines'> = {}
): BookViewInput {
  const s = data.settings;
  return {
    corporationId,
    now,
    startDate: s.startDate,
    graceHours: s.graceHours,
    minimumStatement: s.minimumStatement,
    overdueDays: s.overdueDays,
    cadence: s.cadence,
    hubId: s.hubId,
    oreForm: s.oreForm,
    structureExpiryHours: s.structureExpiryHours,
    chunkM3PerHour: s.chunkM3PerHour ?? undefined,
    lastSyncedAt: s.lastSync ? new Date(s.lastSync.at).toISOString() : undefined,
    rates: s.rates,
    entries: groupObservedEntries(data.observed),
    miners: data.state.miners,
    statements: data.state.statements,
    payments: data.state.payments,
    dismissals: data.state.dismissals,
    declarations: data.declarations,
    adjustments: data.adjustments,
    ...(data.state.writeOffs ? { writeOffs: data.state.writeOffs } : {}),
    feeders: data.feeders,
    extractions: data.state.extractions,
    paidStatementIds: data.state.paidStatementIds,
    pricesOn: prices.pricesOn,
    moonOwnerPricesOn: prices.moonOwnerPricesOn,
    memberIds: extra.memberIds,
    surveyOreLines: extra.surveyOreLines,
  };
}

/** The unit prices every loaded row and Extraction needs, as the view's two lookups. */
export async function loadBookPrices(data: BookData, from?: string) {
  const priced = from !== undefined ? data.observed.filter((r) => r.date >= from) : data.observed;
  const typeIds = new Set<number>(priced.map((r) => r.typeId));
  for (const x of data.state.extractions) for (const l of x.oreLines ?? []) typeIds.add(l.typeId);
  const dates = new Set<string>(priced.map((r) => r.date));
  const loadedOn = utcDay();
  dates.add(loadedOn);
  const prices = await loadDatedUnitPricesByHub(
    [...typeIds],
    [data.settings.hubId],
    [...dates],
    data.settings.oreForm === 'compressed',
    { moonOwner: true }
  );
  return {
    // A page left open past midnight asks for a day it never priced: use the last loaded one.
    pricesOn: (date: string) => {
      const day = priceDay(prices, data.settings.hubId, date);
      return day.prices.size > 0 ? day : priceDay(prices, data.settings.hubId, loadedOn);
    },
    // No fallback day: the moon owner's page prices an unsaved day at 0, so this does too.
    moonOwnerPricesOn: (date: string) =>
      moonOwnerPricesAtHubOnDate(prices, hubForPayee(data.settings.hubId).id, date),
  };
}

function priceDay(
  data: Awaited<ReturnType<typeof loadDatedUnitPricesByHub>>,
  hubId: string,
  date: string
) {
  const id = hubForPayee(hubId).id;
  return {
    prices: new Map(pricesAtHubOnDate(data, id, date)),
    sources: new Map(sourcesAtHubOnDate(data, id, date)),
  };
}
