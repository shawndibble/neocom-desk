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

type BookWithRefinery = BookData & Pick<BookRead, 'refinery'>;

export interface BookPrices {
  pricesOn: BookViewInput['pricesOn'];
  moonOwnerPricesOn: NonNullable<BookViewInput['moonOwnerPricesOn']>;
}

export function bookViewInputOf(
  corporationId: number,
  now: string,
  data: BookData,
  prices: BookPrices,
  extra: Pick<BookViewInput, 'memberIds' | 'surveyOreLines' | 'surveyMeasured'> = {}
): BookViewInput {
  const s = data.settings;
  return {
    corporationId,
    now,
    startDate: s.startDate,
    graceHours: s.graceHours,
    overdueDays: s.overdueDays,
    hubId: s.hubId,
    oreForm: s.oreForm,
    structureExpiryHours: s.structureExpiryHours,
    chunkM3PerHour: s.chunkM3PerHour ?? undefined,
    lastSyncedAt: s.lastSync ? new Date(s.lastSync.at).toISOString() : undefined,
    rates: s.rates,
    entries: groupObservedEntries(data.observed),
    miners: data.state.miners,
    notices: data.state.notices,
    payments: data.state.payments,
    dismissals: data.state.dismissals,
    declarations: data.declarations,
    ...(data.disputes ? { disputes: data.disputes } : {}),
    adjustments: data.adjustments,
    ...(data.toleranceExemptions ? { toleranceExemptions: data.toleranceExemptions } : {}),
    ...(data.state.writeOffs ? { writeOffs: data.state.writeOffs } : {}),
    feeders: data.feeders,
    extractions: data.state.extractions,
    ...(data.state.minerPaidThrough ? { minerPaidThrough: data.state.minerPaidThrough } : {}),
    ...(data.checkpoints?.length
      ? { checkpoints: new Map(data.checkpoints.map((c) => [c.minerId, c])) }
      : {}),
    dayTolerancePct: s.dayTolerancePct,
    pricesOn: prices.pricesOn,
    moonOwnerPricesOn: prices.moonOwnerPricesOn,
    memberIds: extra.memberIds,
    surveyOreLines: extra.surveyOreLines,
    surveyMeasured: extra.surveyMeasured,
  };
}

const heldPrices = new Map<
  string,
  { loadedOn: string; typeIds: ReadonlySet<number>; dates: ReadonlySet<string>; prices: BookPrices }
>();
registerTestReset(() => heldPrices.clear());

const heldKey = (data: BookData) => `${data.settings.hubId}:${data.settings.oreForm}`;

export function surveyTypeIdsOf(lines: BookViewInput['surveyOreLines']): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const ls of lines?.values() ?? []) for (const l of ls) ids.add(l.typeId);
  return ids;
}

function typeIdsOf(
  data: BookWithRefinery,
  priced: BookData['observed'],
  extra: ReadonlySet<number> = new Set()
): Set<number> {
  const typeIds = new Set<number>([...priced.map((r) => r.typeId), ...extra]);
  for (const x of data.state.extractions) for (const l of x.oreLines ?? []) typeIds.add(l.typeId);
  for (const d of data.refinery?.docs.values() ?? [])
    for (const l of d.mined) typeIds.add(l.typeId);
  return typeIds;
}

export async function cachedBookPrices(data: BookWithRefinery): Promise<BookPrices> {
  const held = heldPrices.get(heldKey(data));
  const covers =
    held !== undefined &&
    held.loadedOn === utcDay() &&
    [...typeIdsOf(data, data.observed)].every((id) => held.typeIds.has(id)) &&
    data.observed.every((r) => held.dates.has(r.date));
  return covers ? held.prices : loadBookPrices(data);
}

export async function loadBookPrices(
  data: BookWithRefinery,
  from?: string,
  extraTypeIds?: ReadonlySet<number>
): Promise<BookPrices> {
  const priced = from !== undefined ? data.observed.filter((r) => r.date >= from) : data.observed;
  const typeIds = typeIdsOf(data, priced, extraTypeIds);
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
    pricesOn: (date: string) => {
      const day = priceDay(prices, data.settings.hubId, date);
      return day.prices.size > 0 ? day : priceDay(prices, data.settings.hubId, loadedOn);
    },
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
