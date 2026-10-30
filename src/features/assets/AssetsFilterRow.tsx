import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FilterBar,
  IskInput,
  MultiSelect,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type MultiSelectGroup,
} from '@/components/ui';
import { useIsNarrow } from '@/lib/useIsNarrow';
import {
  BLUEPRINT_KINDS,
  allOptionIds,
  headingState,
  pickIsAll,
  toggleHeading,
  toggleOption,
  type BlueprintKind,
  type CategoryHeading,
} from './assetCategoryFilter';
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
    categoryPick,
    blueprintKind,
    showBlueprintSelect,
    activeFilterCount,
  } = assetsData;
  const { searchRef, sortField, setSortField } = assetsRows;

  const headingByLabel = useMemo(() => {
    const map = new Map<string, CategoryHeading>();
    for (const heading of categoryIndex?.headings ?? []) map.set(heading.name, heading);
    return map;
  }, [categoryIndex]);
  // A heading holding one row of its own name ("Not on the market") is just that row.
  const groups = useMemo<readonly MultiSelectGroup<number>[]>(
    () =>
      (categoryIndex?.headings ?? []).map((heading) => ({
        label:
          heading.options.length === 1 && heading.options[0].name === heading.name
            ? ''
            : heading.name,
        options: heading.options.map((option) => ({ id: option.id, label: option.name })),
      })),
    [categoryIndex]
  );

  const selected = useMemo<ReadonlySet<number>>(
    () =>
      pickIsAll(categoryPick)
        ? new Set(categoryIndex ? allOptionIds(categoryIndex) : [])
        : categoryPick,
    [categoryPick, categoryIndex]
  );
  const total = categoryIndex ? allOptionIds(categoryIndex).length : 0;
  const summary = pickIsAll(categoryPick)
    ? t('assets.category.all')
    : categoryPick.size === 0
      ? t('assets.category.none')
      : `${categoryPick.size} / ${total}`;

  const category = categoryIndex && (
    <MultiSelect<number>
      className="w-full md:w-52"
      label={t('assets.category.label')}
      triggerLabel={t('assets.category.label')}
      summary={summary}
      triggerAriaLabel={`${t('assets.category.label')}, ${summary}`}
      groups={groups}
      selected={selected}
      onToggle={(id) => setView({ cat: toggleOption(categoryIndex, categoryPick, id) })}
      groupState={(group) => {
        const heading = headingByLabel.get(group.label);
        return heading ? headingState(categoryPick, heading) : false;
      }}
      onToggleGroup={(group) => {
        const heading = headingByLabel.get(group.label);
        if (heading) setView({ cat: toggleHeading(categoryIndex, categoryPick, heading) });
      }}
      searchPlaceholder={t('assets.category.search')}
      noResultsLabel={t('assets.category.noResults')}
      extraContent={
        <div className="flex gap-2 border-b border-line p-1">
          <Button size="sm" onClick={() => setView({ cat: 'all' })}>
            {t('assets.category.selectAll')}
          </Button>
          <Button size="sm" onClick={() => setView({ cat: new Set() })}>
            {t('assets.category.selectNone')}
          </Button>
        </div>
      }
    />
  );

  const blueprints = showBlueprintSelect && (
    <Select value={blueprintKind} onValueChange={(bp) => setView({ bp: bp as BlueprintKind })}>
      <SelectTrigger aria-label={t('assets.blueprints.label')} className="w-full md:w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BLUEPRINT_KINDS.map((kind) => (
          <SelectItem key={kind} value={kind}>
            {t(`assets.blueprints.${kind}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
