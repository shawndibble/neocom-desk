import type { TFunction } from 'i18next';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { usePiSettings } from '@/features/pi/piSettings';
import type { PageHubArea } from './pageHubs';
import { DEFAULT_PRICE_PERCENT, isValidPricePercent, useMarketPricePercent } from './pricePercent';

export type PagePricePercentMap = Readonly<Record<string, number>>;

export const PAGE_PRICE_PERCENTS_SETTING_KEY = 'sync.pagePricePercents';

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

const NO_PERCENT_FIELD: ReadonlySet<PageHubArea> = new Set([
  'market',
  'overview',
  'corpSrp',
  'appraisal',
  'assets',
]);

export function hasPercentField(area: PageHubArea): boolean {
  return !NO_PERCENT_FIELD.has(area);
}

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

export const PRICE_PERCENT_STORES = [
  usePagePricePercents,
  useMarketPricePercent,
  usePiSettings,
] as const;

export function usePricePercentFor(area: PageHubArea): number {
  useHydratedStore(...PRICE_PERCENT_STORES);
  const map = usePagePricePercents((state) => state.value);
  const appraisal = useMarketPricePercent((state) => state.value);
  const buyback = usePiSettings((state) => state.value.buybackPct);
  return percentFrom(area, map, appraisal, buyback);
}

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

export async function setPricePercentFor(area: PageHubArea, percent: number): Promise<void> {
  if (!isValidPricePercent(percent)) return;
  if (area === 'appraisal') return useMarketPricePercent.getState().setValue(percent);
  const store = usePagePricePercents.getState();
  await store.hydrate();
  await store.setValue({ ...usePagePricePercents.getState().value, [area]: percent });
  if (area !== 'pi') return;
  const settings = usePiSettings.getState();
  await settings.hydrate();
  const buybackPct =
    percent === DEFAULT_PRICE_PERCENT || percent <= 0 || percent > 100 ? null : percent;
  await settings.setValue({ ...usePiSettings.getState().value, buybackPct });
}

export function withPercent(t: TFunction, hubText: string, percent: number): string {
  return percent === DEFAULT_PRICE_PERCENT
    ? hubText
    : t('pageHubs.withPercent', { hub: hubText, percent });
}

export function atPercent(price: number, percent: number): number {
  return percent === DEFAULT_PRICE_PERCENT ? price : (price * percent) / 100;
}
