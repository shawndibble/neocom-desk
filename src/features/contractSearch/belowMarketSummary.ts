/**
 * The last Below market view (#3989), boiled down to what the Overview's
 * Below-market contracts widget shows. Item search writes it when the view
 * lands; the widget only reads it, so the Overview never downloads the whole
 * contract snapshot or prices it at the hub — the Hauling widget's rule
 * (#3579).
 */
import { formatCount } from '@/lib/formatCount';
import type { TFunction } from 'i18next';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { createLocalSetting } from '@/lib/useLocalSetting';

/** The lead line as the Item cell names it: "Damage Control II ×40", "Gila Blueprint (copy, 3 runs)". */
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
  /** `belowMarketItemLabel` of the lead line. */
  item: string;
  /** Other lines in the contract. */
  more: number;
  profit: number;
  /** Where the contract sits, for jumps from the widget's Character; null when unplaced. */
  systemId: number | null;
}

export interface BelowMarketSummary {
  /** When the contract snapshot behind it was published, ms since the epoch. */
  fetchedAt: number;
  /** Total below market, not just those kept in `contracts`. */
  count: number;
  /** Best profit first, at most `MAX_SUMMARY_CONTRACTS`. */
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

/** Saves a summary unless it is the one already stored (the panel recomputes as names and places land). */
export function rememberBelowMarketSummary(summary: BelowMarketSummary): void {
  const { value, setValue } = useBelowMarketSummary.getState();
  if (value !== null && JSON.stringify(value) === JSON.stringify(summary)) return;
  void setValue(summary);
}
