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
import { registerTestReset } from '@/lib/testResets';
import type { BookData } from '../taxBook/bookClient';

export interface BookPrices {
  pricesOn: BookViewInput['pricesOn'];
  moonOwnerPricesOn: NonNullable<BookViewInput['moonOwnerPricesOn']>;
}

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

/**
 * The last prices loaded per hub and Ore Form this session, with the ores they cover: the Moons
 * nav dot's 30-minute recount reads its count off these rather than loading the market again.
 */
const heldPrices = new Map<string, { typeIds: ReadonlySet<number>; prices: BookPrices }>();
registerTestReset(() => heldPrices.clear());

const heldKey = (data: BookData) => `${data.settings.hubId}:${data.settings.oreForm}`;

function typeIdsOf(data: BookData, priced: BookData['observed']): Set<number> {
  const typeIds = new Set<number>(priced.map((r) => r.typeId));
  for (const x of data.state.extractions) for (const l of x.oreLines ?? []) typeIds.add(l.typeId);
  return typeIds;
}

/**
 * Prices for a count, not for display (the Moons nav dot): the ones this session last loaded at
 * the book's hub and Ore Form when they cover every ore it holds, else a load. A day the held
 * load never priced reads that load's own day (`pricesOn`), close enough to say whether a
 * Statement run is due; the Moons page loads its own, fresh.
 */
export async function heldBookPrices(data: BookData): Promise<BookPrices> {
  const held = heldPrices.get(heldKey(data));
  if (held && [...typeIdsOf(data, data.observed)].every((id) => held.typeIds.has(id)))
    return held.prices;
  return loadBookPrices(data);
}

/** The unit prices every loaded row and Extraction needs, as the view's two lookups. */
export async function loadBookPrices(data: BookData, from?: string): Promise<BookPrices> {
  const priced = from !== undefined ? data.observed.filter((r) => r.date >= from) : data.observed;
  const typeIds = typeIdsOf(data, priced);
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
  const result = {
    // A page left open past midnight asks for a day it never priced: use the last loaded one.
    pricesOn: (date: string) => {
      const day = priceDay(prices, data.settings.hubId, date);
      return day.prices.size > 0 ? day : priceDay(prices, data.settings.hubId, loadedOn);
    },
    // No fallback day: the moon owner's page prices an unsaved day at 0, so this does too.
    moonOwnerPricesOn: (date: string) =>
      moonOwnerPricesAtHubOnDate(prices, hubForPayee(data.settings.hubId).id, date),
  };
  heldPrices.set(heldKey(data), { typeIds, prices: result });
  return result;
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
