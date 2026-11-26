import { formatCount } from '@/lib/formatCount';
import type { TFunction } from 'i18next';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { createLocalSetting } from '@/lib/useLocalSetting';

export function belowMarketItemLabel(
  lead: PublicContractOfferRow,
  typeNames: ReadonlyMap<number, string>,
  t: TFunction
): string {
  const name = typeNames.get(lead.typeId) ?? `#${lead.typeId}`;
  const base = lead.isBlueprintCopy
    ? t('contractSearch.belowMarket.copyItem', { name, count: lead.runs ?? 0 })
    : name;
  return lead.quantity > 1 ? `${base} ×${formatCount(lead.quantity)}` : base;
}

export interface BelowMarketSummaryContract {
  contractId: number;
  item: string;
  more: number;
  profit: number;
  systemId: number | null;
}

export interface BelowMarketSummary {
  fetchedAt: number;
  count: number;
  contracts: BelowMarketSummaryContract[];
}

export const MAX_SUMMARY_CONTRACTS = 10;

function isSummaryContract(value: unknown): value is BelowMarketSummaryContract {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<BelowMarketSummaryContract>;
  return (
    typeof c.contractId === 'number' &&
    typeof c.item === 'string' &&
    typeof c.more === 'number' &&
    typeof c.profit === 'number' &&
    (typeof c.systemId === 'number' || c.systemId === null)
  );
}

function parseSummary(raw: unknown): BelowMarketSummary | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { fetchedAt, count, contracts } = raw as Partial<BelowMarketSummary>;
  if (typeof fetchedAt !== 'number' || typeof count !== 'number' || !Array.isArray(contracts)) {
    return null;
  }
  return {
    fetchedAt,
    count,
    contracts: contracts.filter(isSummaryContract).slice(0, MAX_SUMMARY_CONTRACTS),
  };
}

export const useBelowMarketSummary = createLocalSetting<BelowMarketSummary | null>({
  key: 'belowMarketLastView',
  defaultValue: null,
  parse: parseSummary,
});

export function rememberBelowMarketSummary(summary: BelowMarketSummary): void {
  const { value, setValue } = useBelowMarketSummary.getState();
  if (value !== null && JSON.stringify(value) === JSON.stringify(summary)) return;
  void setValue(summary);
}
