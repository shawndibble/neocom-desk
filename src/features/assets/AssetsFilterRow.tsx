import { useTranslation } from 'react-i18next';
import {
  FilterBar,
  IskInput,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { AssetCategoryPicker, BlueprintKindSelect } from './AssetCategoryPicker';
import type { AssetSortField } from './assetSortPreference';
import type { AssetsData } from './useAssetsData';
import type { AssetsRows } from './useAssetsRows';

/**
 * The Items page's one filter row (issue #5601): search, Category, Blueprints
 * (only while something under Blueprints & Reactions is ticked), min value and,
 * in a flat list, sort. Inline from `md` up; behind the funnel's sheet on a phone.
 */
export function AssetsFilterRow({
  assetsData,
  assetsRows,
}: {
  assetsData: AssetsData;
  assetsRows: AssetsRows;
}) {
  const { t } = useTranslation();
  const isNarrow = useIsNarrow();
  const {
    search,
    setSearch,
    setView,
    minValueInput,
    flatModeActive,
    categoryIndex,
    pickerIndex,
    categoryPick,
    blueprintKind,
    showBlueprintSelect,
    activeFilterCount,
  } = assetsData;
  const { searchRef, sortField, setSortField } = assetsRows;

  const category = categoryIndex && pickerIndex && (
    <AssetCategoryPicker
      index={categoryIndex}
      visibleIndex={pickerIndex}
      pick={categoryPick}
      onChange={(cat) => setView({ cat })}
    />
  );

  const blueprints = showBlueprintSelect && (
    <BlueprintKindSelect value={blueprintKind} onChange={(bp) => setView({ bp })} />
  );

  const minValue = (
    <IskInput
      echo={false}
      value={minValueInput}
      onChange={(min) => setView({ min })}
      placeholder={t('assets.minValue.placeholder')}
      aria-label={t('assets.minValue.label')}
      className="w-full md:w-28"
    />
  );

  const sort = flatModeActive && (
    <Select value={sortField} onValueChange={(value) => void setSortField(value as AssetSortField)}>
      <SelectTrigger aria-label={t('assets.sort.label')} className="w-full md:w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="name">{t('assets.sort.name')}</SelectItem>
        <SelectItem value="value">{t('assets.sort.value')}</SelectItem>
        <SelectItem value="quantity">{t('assets.sort.quantity')}</SelectItem>
      </SelectContent>
    </Select>
  );

  const searchBox = (
    <SearchInput
      ref={searchRef}
      className="min-w-48 flex-1"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder={t('assets.searchPlaceholder')}
    />
  );

  if (isNarrow) {
    return (
      <FilterBar
        value={null}
        onChange={() => {}}
        search={searchBox}
        activeCount={activeFilterCount}
        title={t('assets.filters.title')}
      >
        {() => (
          <div className="flex flex-col gap-2">
            {category}
            {blueprints}
            {minValue}
            {sort}
          </div>
        )}
      </FilterBar>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {searchBox}
      {category}
      {blueprints}
      {minValue}
      {sort}
    </div>
  );
}
