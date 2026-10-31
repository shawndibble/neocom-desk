import { iskToneClass } from '@/features/character/format';
import { fixed1 } from '@/lib/fixedFormat';
import { formatCount } from '@/lib/formatCount';
import type { LoyaltyOfferRow } from './offerRows';

/**
 * A short uppercase marker beside a name ("BP", "FW"). `shrink-0` +
 * `whitespace-nowrap`: beside a long name it was squeezed until "BP" broke
 * across two lines, one letter each.
 */
export const tagWordClassName =
  'shrink-0 px-1 text-[0.6875rem] font-bold tracking-widest whitespace-nowrap text-warning uppercase';

/** Units a day: one decimal under 10, where it still says something. */
export function formatSellsPerDay(value: number): string {
  return value < 10 ? fixed1(value) : formatCount(value);
}

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
