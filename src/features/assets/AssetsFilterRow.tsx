import { useTranslation } from 'react-i18next';
import {
  FilterBar,
  FilterField,
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
import { pickIsAll } from './assetCategoryFilter';
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
    filterValue,
    activeFilters,
  } = assetsData;
  const { searchRef, sortField, setSortField, rows } = assetsRows;

  // Each control sits in a `FilterField` whose label is its pill's, so a pill
  // tapped on a phone opens the sheet on that control. Outside a `FilterBar`
  // (the desktop row) a `FilterField` is `display: contents`, so the inline
  // layout is untouched.
  const category = categoryIndex && pickerIndex && (
    <FilterField label={t('assets.category.label')}>
      <AssetCategoryPicker
        index={categoryIndex}
        visibleIndex={pickerIndex}
        pick={categoryPick}
        active={!pickIsAll(categoryPick)}
        onChange={(cat) => setView({ cat })}
      />
    </FilterField>
  );

  const blueprints = showBlueprintSelect && (
    <FilterField label={t('assets.blueprints.label')}>
      <BlueprintKindSelect
        value={blueprintKind}
        active={blueprintKind !== 'any'}
        onChange={(bp) => setView({ bp })}
      />
    </FilterField>
  );

  const minValue = (
    <FilterField label={t('assets.minValue.label')}>
      <IskInput
        value={minValueInput}
        onChange={(min) => setView({ min })}
        placeholder={t('assets.minValue.placeholder')}
        aria-label={t('assets.minValue.label')}
        className="w-full md:w-28"
      />
    </FilterField>
  );

  // Sort orders the list rather than narrowing it, so it is never a pill.
  const sort = flatModeActive && (
    <FilterField label={t('assets.sort.label')}>
      <Select
        value={sortField}
        onValueChange={(value) => void setSortField(value as AssetSortField)}
      >
        <SelectTrigger aria-label={t('assets.sort.label')} className="w-full md:w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">{t('assets.sort.name')}</SelectItem>
          <SelectItem value="value">{t('assets.sort.value')}</SelectItem>
          <SelectItem value="quantity">{t('assets.sort.quantity')}</SelectItem>
        </SelectContent>
      </Select>
    </FilterField>
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
        value={filterValue}
        onChange={(next) => setView({ cat: next.cat, bp: next.bp, min: next.min })}
        search={searchBox}
        active={activeFilters}
        // Only a flat list's rows are results; browsing, they are a place's contents.
        resultCount={flatModeActive ? rows.length : undefined}
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
