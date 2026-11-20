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
import type { BookRead } from '../taxBook/bookRead';
import type { BookData } from '../taxBook/bookClient';

/** A book read: a refinery page's moon docs ride beside the book's data. */
type BookWithRefinery = BookData & Pick<BookRead, 'refinery'>;

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
    ...(data.disputes ? { disputes: data.disputes } : {}),
    adjustments: data.adjustments,
    ...(data.toleranceExemptions ? { toleranceExemptions: data.toleranceExemptions } : {}),
    ...(data.state.writeOffs ? { writeOffs: data.state.writeOffs } : {}),
    feeders: data.feeders,
    extractions: data.state.extractions,
    paidStatementIds: data.state.paidStatementIds,
    ...(data.state.minerPaidThrough ? { minerPaidThrough: data.state.minerPaidThrough } : {}),
    ...(s.runningAccountFrom
      ? { runningAccountFrom: s.runningAccountFrom, dayTolerancePct: s.dayTolerancePct }
      : {}),
    pricesOn: prices.pricesOn,
    moonOwnerPricesOn: prices.moonOwnerPricesOn,
    memberIds: extra.memberIds,
    surveyOreLines: extra.surveyOreLines,
  };
}

/**
 * The last prices loaded per hub and Ore Form today, with the ores and days they price: the Moons
 * nav dot's 30-minute recount reads its count off these rather than loading the market again.
 */
const heldPrices = new Map<
  string,
  { loadedOn: string; typeIds: ReadonlySet<number>; dates: ReadonlySet<string>; prices: BookPrices }
>();
registerTestReset(() => heldPrices.clear());

const heldKey = (data: BookData) => `${data.settings.hubId}:${data.settings.oreForm}`;

function typeIdsOf(data: BookWithRefinery, priced: BookData['observed']): Set<number> {
  const typeIds = new Set<number>(priced.map((r) => r.typeId));
  for (const x of data.state.extractions) for (const l of x.oreLines ?? []) typeIds.add(l.typeId);
  // A refinery page reads no ledger row: the ore its moon docs hold is priced all the same.
  for (const d of data.refinery?.docs.values() ?? [])
    for (const l of d.mined) typeIds.add(l.typeId);
  return typeIds;
}

/**
 * Prices for a count, not for display (the Moons nav dot): the ones loaded today at the book's
 * hub and Ore Form when they price every ore and day it holds, else a load. The Moons page loads
 * its own, fresh.
 */
export async function cachedBookPrices(data: BookWithRefinery): Promise<BookPrices> {
  const held = heldPrices.get(heldKey(data));
  const covers =
    held !== undefined &&
    held.loadedOn === utcDay() &&
    [...typeIdsOf(data, data.observed)].every((id) => held.typeIds.has(id)) &&
    data.observed.every((r) => held.dates.has(r.date));
  return covers ? held.prices : loadBookPrices(data);
}

/** The unit prices every loaded row and Extraction needs, as the view's two lookups. */
export async function loadBookPrices(data: BookWithRefinery, from?: string): Promise<BookPrices> {
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
  heldPrices.set(heldKey(data), { loadedOn, typeIds, dates, prices: result });
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
