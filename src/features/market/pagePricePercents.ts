/**
 * Page price percents (issue #6531): a percentage of market each page area
 * prices at, beside its Trade Hub (`pageHubs.ts`). 100 is the hub's price as
 * it stands; a buyback paying 90% of Jita, or a pilot who budgets at 105%,
 * sets their own. The percent belongs to the page whichever hub it uses
 * (Global or its own), so it lives in its own map, never in `sync.pageHubs`.
 *
 * `sync.pagePricePercents` is one synced map `area -> percent`, account-wide;
 * a page with no entry is at 100, so an empty map prices exactly as before.
 * Two areas keep the percent they already had, so there is never a second one
 * to stack with it:
 * - Appraisal: `sync.marketPricePercent` (its Price % field, `pricePercent.ts`).
 * - PI: its corp buyback rate (`piSettings.buybackPct`, device-local). An entry
 *   here wins; a percent written here is also written there (100 as no
 *   buyback), which older builds still read.
 *
 * The side a page prices on (buy or sell) is the page's; the popover only uses
 * it to name the field (`HubMenu`). The percent scales whatever price the page
 * reads, applied where the page reads it: the price lookups are cached per
 * station and shared by every page, so they are never scaled centrally.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { usePiSettings } from '@/features/pi/piSettings';
import type { PageHubArea } from './pageHubs';
import { DEFAULT_PRICE_PERCENT, isValidPricePercent, useMarketPricePercent } from './pricePercent';

export type PagePricePercentMap = Readonly<Record<string, number>>;

export const PAGE_PRICE_PERCENTS_SETTING_KEY = 'sync.pagePricePercents';

/** Keeps every valid entry, an unknown area's too (a newer build's), as `parsePageHubs` does. */
export function parsePagePricePercents(raw: unknown): PagePricePercentMap | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [area, value] of Object.entries(raw)) {
    if (typeof value === 'number' && isValidPricePercent(value)) out[area] = value;
  }
  return out;
}

export const usePagePricePercents = createSyncedSetting<PagePricePercentMap>({
  key: PAGE_PRICE_PERCENTS_SETTING_KEY,
  defaultValue: {},
  parse: parsePagePricePercents,
});

/**
 * The pages with no percent in the popover: raw order books and history
 * (Market, Overview), order-book depth (Corp SRP), Appraisal (its Price % field
 * sits on the page) and Assets (no hub picker of its own, and its haul value
 * doubles as collateral).
 */
const NO_PERCENT_FIELD: ReadonlySet<PageHubArea> = new Set([
  'market',
  'overview',
  'corpSrp',
  'appraisal',
  'assets',
]);

/** Whether `area`'s hub popover offers a Buy/Sell percent. */
export function hasPercentField(area: PageHubArea): boolean {
  return !NO_PERCENT_FIELD.has(area);
}

/** The percent from already-read stores: the pure rule behind the hook and the loader. */
export function percentFrom(
  area: PageHubArea,
  map: PagePricePercentMap,
  appraisalPercent: number,
  piBuybackPct: number | null
): number {
  if (area === 'appraisal') return appraisalPercent;
  const own = map[area];
  if (own !== undefined) return own;
  if (area === 'pi') return piBuybackPct ?? DEFAULT_PRICE_PERCENT;
  return DEFAULT_PRICE_PERCENT;
}

/** `area`'s percent, live. Reads 100 until the stores are read, as an empty map does. */
export function usePricePercentFor(area: PageHubArea): number {
  const map = usePagePricePercents((state) => state.value);
  const appraisal = useMarketPricePercent((state) => state.value);
  const buyback = usePiSettings((state) => state.value.buybackPct);
  return percentFrom(area, map, appraisal, buyback);
}

/** `area`'s percent once its stores are read, for a loader outside React. */
export async function loadPricePercentFor(area: PageHubArea): Promise<number> {
  await Promise.all([
    usePagePricePercents.getState().hydrate(),
    area === 'appraisal' ? useMarketPricePercent.getState().hydrate() : undefined,
    area === 'pi' ? usePiSettings.getState().hydrate() : undefined,
  ]);
  return percentFrom(
    area,
    usePagePricePercents.getState().value,
    useMarketPricePercent.getState().value,
    usePiSettings.getState().value.buybackPct
  );
}

/** Writes `area`'s percent; an invalid value is ignored. */
export async function setPricePercentFor(area: PageHubArea, percent: number): Promise<void> {
  if (!isValidPricePercent(percent)) return;
  if (area === 'appraisal') return useMarketPricePercent.getState().setValue(percent);
  const store = usePagePricePercents.getState();
  await store.hydrate();
  await store.setValue({ ...usePagePricePercents.getState().value, [area]: percent });
  if (area !== 'pi') return;
  // Older builds read the buyback: 100 is selling on the market; they accept 1–100 only.
  const settings = usePiSettings.getState();
  await settings.hydrate();
  const buybackPct =
    percent === DEFAULT_PRICE_PERCENT || percent <= 0 || percent > 100 ? null : percent;
  await settings.setValue({ ...usePiSettings.getState().value, buybackPct });
}

/** "Amarr", or "Amarr · 90%" when the page's percent is not 100. */
export function withPercent(hubText: string, percent: number): string {
  return percent === DEFAULT_PRICE_PERCENT ? hubText : `${hubText} · ${percent}%`;
}

/** `price` at `percent` of market. */
export function atPercent(price: number, percent: number): number {
  return percent === DEFAULT_PRICE_PERCENT ? price : (price * percent) / 100;
}
