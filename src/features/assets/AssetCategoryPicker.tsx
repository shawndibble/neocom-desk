import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  MultiSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type MultiSelectGroup,
} from '@/components/ui';
import {
  BLUEPRINT_KINDS,
  allOptionIds,
  headingState,
  pickIsAll,
  toggleHeading,
  toggleOption,
  type AssetCategoryIndex,
  type BlueprintKind,
  type CategoryHeading,
  type CategoryPick,
} from './assetCategoryFilter';

/**
 * The two-level Asset Category picker (issue #5601), shared by Assets and Corp
 * Assets: search, Select all / Select none, a heading per Asset Category with
 * its direct child market groups beneath it.
 */
export function AssetCategoryPicker({
  index,
  pick,
  onChange,
}: {
  index: AssetCategoryIndex;
  pick: CategoryPick;
  onChange: (pick: CategoryPick) => void;
}) {
  const { t } = useTranslation();

  const headingByLabel = useMemo(() => {
    const map = new Map<string, CategoryHeading>();
    for (const heading of index.headings) map.set(heading.name, heading);
    return map;
  }, [index]);
  // A heading holding one row of its own name ("Not on the market") is just that row.
  const groups = useMemo<readonly MultiSelectGroup<number>[]>(
    () =>
      index.headings.map((heading) => ({
        label:
          heading.options.length === 1 && heading.options[0].name === heading.name
            ? ''
            : heading.name,
        options: heading.options.map((option) => ({ id: option.id, label: option.name })),
      })),
    [index]
  );

  const selected = useMemo<ReadonlySet<number>>(
    () => (pickIsAll(pick) ? new Set(allOptionIds(index)) : pick),
    [pick, index]
  );
  const total = allOptionIds(index).length;
  const summary = pickIsAll(pick)
    ? t('assets.category.all')
    : pick.size === 0
      ? t('assets.category.none')
      : `${pick.size} / ${total}`;

  return (
    <MultiSelect<number>
      className="w-full md:w-52"
      label={t('assets.category.label')}
      triggerLabel={t('assets.category.label')}
      summary={summary}
      triggerAriaLabel={`${t('assets.category.label')}, ${summary}`}
      groups={groups}
      selected={selected}
      onToggle={(id) => onChange(toggleOption(index, pick, id))}
      groupState={(group) => {
        const heading = headingByLabel.get(group.label);
        return heading ? headingState(pick, heading) : false;
      }}
      onToggleGroup={(group) => {
        const heading = headingByLabel.get(group.label);
        if (heading) onChange(toggleHeading(index, pick, heading));
      }}
      searchPlaceholder={t('assets.category.search')}
      noResultsLabel={t('assets.category.noResults')}
      extraContent={
        <div className="flex gap-2 border-b border-line p-1">
          <Button size="sm" onClick={() => onChange('all')}>
            {t('assets.category.selectAll')}
          </Button>
          <Button size="sm" onClick={() => onChange(new Set())}>
            {t('assets.category.selectNone')}
          </Button>
        </div>
      }
    />
  );
}

/** Any / Originals / Copies; shown only while a Blueprints & Reactions option is ticked. */
export function BlueprintKindSelect({
  value,
  onChange,
}: {
  value: BlueprintKind;
  onChange: (kind: BlueprintKind) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(kind) => onChange(kind as BlueprintKind)}>
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
}
