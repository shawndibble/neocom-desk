import { activeAssetKindFilters } from '@/features/assets/assetCategoryFilter';
import type {
  AssetCategoryIndex,
  BlueprintKind,
  CategoryPick,
} from '@/features/assets/assetCategoryFilter';
import type { LedgerLabels } from '@/features/corp/assetLedgerView';
import type { ActiveFilter } from '@/components/ui';
import type { Translate } from '@/lib/translate';

export interface PlaceFilter {
  loc: number | null;
  div: number | null;
  cat: CategoryPick;
  bp: BlueprintKind;
}

export function activePlaceFilters(
  filter: PlaceFilter,
  {
    labels,
    categoryIndex,
    showBlueprintSelect,
  }: {
    labels: LedgerLabels;
    categoryIndex: AssetCategoryIndex | null;
    showBlueprintSelect: boolean;
  },
  t: Translate
): ActiveFilter<PlaceFilter>[] {
  const active: ActiveFilter<PlaceFilter>[] = [];
  if (filter.loc !== null)
    active.push({
      label: t('corp.assets.filter.location'),
      value: labels.shortPlaceName(filter.loc) ?? labels.placeName(filter.loc),
      clear: (next) => ({ ...next, loc: null }),
    });
  if (filter.div !== null)
    active.push({
      label: t('corp.assets.filter.division'),
      value: labels.divisionName(filter.div),
      clear: (next) => ({ ...next, div: null }),
    });
  active.push(
    ...activeAssetKindFilters(
      filter,
      {
        index: categoryIndex,
        showBlueprintSelect,
        categoryLabel: t('corp.assets.filter.category'),
      },
      t
    )
  );
  return active;
}
