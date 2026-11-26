import { iskToneClass } from '@/features/character/format';
import { fixed1 } from '@/lib/fixedFormat';
import { formatCount } from '@/lib/formatCount';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import type { LoyaltyOfferRow } from './offerRows';

export const tagWordClassName =
  'shrink-0 px-1 text-[0.6875rem] font-bold tracking-widest whitespace-nowrap text-warning uppercase';

export function formatSellsPerDay(value: number): string {
  return value < 10 ? fixed1(value) : formatCount(value);
}

export function formatIskPerLp(value: number): string {
  return formatSellsPerDay(value);
}

export const LOW_SELLS_PER_DAY = 1;

export function isLowVolume(row: LoyaltyOfferRow): boolean {
  return row.sellsPerDay !== null && row.sellsPerDay < LOW_SELLS_PER_DAY;
}

export function lpShortfall(row: LoyaltyOfferRow, playerLp: number | null): number | null {
  if (playerLp === null || playerLp <= 0) return null;
  const missing = row.offer.lp_cost - playerLp;
  return missing > 0 ? missing : null;
}

export function iskPerLpTone(value: number | null): string {
  return value === null ? 'text-text-dim' : iskToneClass(value);
}

export function resolveLoyaltyRowItem(row: LoyaltyOfferRow): {
  typeId: number | null;
  itemName: string;
} {
  if (!row.isBlueprint) return { typeId: row.offer.type_id, itemName: row.itemName };
  return { typeId: row.productTypeId, itemName: row.productName ?? row.itemName };
}

export function outputUnitsOf(
  row: LoyaltyOfferRow,
  catalog: BlueprintCatalog | null
): number | null {
  if (!row.isBlueprint) return row.offer.quantity;
  return catalog?.byBlueprintTypeID.get(row.offer.type_id)?.blueprint.products[0]?.quantity ?? null;
}

export function buildCostOf(row: LoyaltyOfferRow): number {
  return row.build ? row.build.materialCost + row.build.jobFee.total : 0;
}
