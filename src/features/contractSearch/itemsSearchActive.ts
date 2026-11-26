import { DEFAULT_JUMP_RANGE, type JumpRange } from '@/engine/route/jumpRange';

export interface ItemsSearchControls {
  typeQuery: string;
  regionId: number | null;
  maxPrice: string;
  minQuantity: string;
  hideExchanges: boolean;
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
    filter.hideExchanges ||
    filter.hideAuctions ||
    filter.hidePlex ||
    filter.jumps !== DEFAULT_JUMP_RANGE
  );
}
