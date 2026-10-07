/**
 * Whether the Items board has anything to search *for* (issue #2921). Until it
 * does the page asks for a search instead of rendering the whole snapshot —
 * ~370k rows nobody asked to see — while the download carries on behind it.
 *
 * Any control off its default counts, not only the item name: "within 10
 * jumps", a price ceiling or a region is a search too. A blank-but-touched
 * text field does not, so it reads the same as the filter bar's own badge.
 */
import { DEFAULT_JUMP_RANGE, type JumpRange } from '@/engine/route/jumpRange';

export interface ItemsSearchControls {
  typeQuery: string;
  regionId: number | null;
  maxPrice: string;
  minQuantity: string;
  saleKind: string | null;
  hideAuctions: boolean;
  hidePlex: boolean;
  jumps: JumpRange;
}

export function isItemsSearchActive(
  filter: ItemsSearchControls,
  selectedTypeId: number | null
): boolean {
  return (
    selectedTypeId !== null ||
    filter.typeQuery.trim() !== '' ||
    filter.regionId !== null ||
    filter.maxPrice.trim() !== '' ||
    filter.minQuantity.trim() !== '' ||
    filter.saleKind !== null ||
    filter.hideAuctions ||
    filter.hidePlex ||
    filter.jumps !== DEFAULT_JUMP_RANGE
  );
}
