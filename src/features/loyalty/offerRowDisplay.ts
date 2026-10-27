import { iskToneClass } from '@/features/character/format';
import type { LoyaltyOfferRow } from './offerRows';

export function iskPerLpTone(value: number | null): string {
  return value === null ? 'text-text-dim' : iskToneClass(value);
}

/**
 * A blueprint offer's row is the *blueprint*, but every market/menu action on
 * it targets the manufactured product — shared by `OfferDetail`'s own
 * View in Market/Plan in Industry buttons and the row's context menu, so the
 * two can't drift on which field means "the real item".
 */
export function resolveLoyaltyRowItem(row: LoyaltyOfferRow): {
  typeId: number | null;
  itemName: string;
} {
  if (!row.isBlueprint) return { typeId: row.offer.type_id, itemName: row.itemName };
  return { typeId: row.productTypeId, itemName: row.productName ?? row.itemName };
}
