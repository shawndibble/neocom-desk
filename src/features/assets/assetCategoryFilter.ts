import type { UrlParamCodec } from '@/lib/urlState';
import type { Translate } from '@/lib/translate';
import { summarizeFilterValues, type ActiveFilter } from '@/components/ui/activeFilters';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';
import { marketGroupBranch } from '@/features/corp/assetCategories';

export const NOT_ON_MARKET = -1;

export type CategoryPick = 'all' | ReadonlySet<number>;
export type BlueprintKind = 'any' | 'original' | 'copy';
export const BLUEPRINT_KINDS: readonly BlueprintKind[] = ['any', 'original', 'copy'];

export interface CategoryOption {
  id: number;
  name: string;
}

export interface CategoryHeading {
  id: number;
  name: string;
  blueprints: boolean;
  options: CategoryOption[];
}

export interface AssetCategoryIndex {
  headings: readonly CategoryHeading[];
  optionByTypeId: ReadonlyMap<number, number>;
  blueprintOptionIds: ReadonlySet<number>;
}

export const EMPTY_CATEGORY_INDEX: AssetCategoryIndex = {
  headings: [],
  optionByTypeId: new Map(),
  blueprintOptionIds: new Set(),
};

const isBlueprintRoot = (name: string) => name.toLowerCase().startsWith('blueprints');

export function buildCategoryIndex(
  groupList: readonly MarketGroupNode[],
  types: Iterable<MarketTypeEntry>,
  notOnMarketLabel: string
): AssetCategoryIndex {
  const groups = new Map(groupList.map((group) => [group.id, group]));
  const roots = groupList.filter((group) => group.parentId === null || !groups.has(group.parentId));
  const rootIds = new Set(roots.map((root) => root.id));
  const headings: CategoryHeading[] = roots
    .map((root) => ({
      id: root.id,
      name: root.name,
      blueprints: isBlueprintRoot(root.name),
      options: [
        ...(root.hasTypes ? [{ id: root.id, name: root.name }] : []),
        ...groupList
          .filter((group) => group.parentId === root.id && !rootIds.has(group.id))
          .map((group) => ({ id: group.id, name: group.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ],
    }))
    .filter((heading) => heading.options.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  headings.push({
    id: NOT_ON_MARKET,
    name: notOnMarketLabel,
    blueprints: false,
    options: [{ id: NOT_ON_MARKET, name: notOnMarketLabel }],
  });

  const optionByGroupId = new Map<number, number>();
  const optionByTypeId = new Map<number, number>();
  for (const type of types) {
    let option = optionByGroupId.get(type.marketGroupId);
    if (option === undefined) {
      const branch = marketGroupBranch(groups, type.marketGroupId);
      option = branch ? (branch.child ?? branch.root).id : NOT_ON_MARKET;
      optionByGroupId.set(type.marketGroupId, option);
    }
    optionByTypeId.set(type.typeId, option);
  }
  const blueprintOptionIds = new Set(
    headings.filter((h) => h.blueprints).flatMap((h) => h.options.map((o) => o.id))
  );
  return { headings, optionByTypeId, blueprintOptionIds };
}

export function pruneCategoryIndex(
  index: AssetCategoryIndex,
  ownedTypeIds: Iterable<number>,
  pick: CategoryPick
): AssetCategoryIndex {
  const owned = new Set<number>();
  for (const typeId of ownedTypeIds) owned.add(index.optionByTypeId.get(typeId) ?? NOT_ON_MARKET);
  const keep = (id: number) => owned.has(id) || (pick !== 'all' && pick.has(id));
  const headings = index.headings
    .map((heading) => ({ ...heading, options: heading.options.filter((o) => keep(o.id)) }))
    .filter((heading) => heading.options.length > 0);
  const shown = new Set(headings.flatMap((h) => h.options.map((o) => o.id)));
  const blueprintOptionIds = new Set([...index.blueprintOptionIds].filter((id) => shown.has(id)));
  return { ...index, headings, blueprintOptionIds };
}

export function allOptionIds(index: AssetCategoryIndex): number[] {
  return index.headings.flatMap((heading) => heading.options.map((option) => option.id));
}

export function normalizePick(
  index: AssetCategoryIndex,
  picked: ReadonlySet<number>
): CategoryPick {
  const every = allOptionIds(index);
  return every.length > 0 && every.every((id) => picked.has(id)) ? 'all' : picked;
}

function pickedSet(index: AssetCategoryIndex, pick: CategoryPick): ReadonlySet<number> {
  return pick === 'all' ? new Set(allOptionIds(index)) : pick;
}

export function toggleOption(
  index: AssetCategoryIndex,
  pick: CategoryPick,
  id: number
): CategoryPick {
  const next = new Set(pickedSet(index, pick));
  if (!next.delete(id)) next.add(id);
  return normalizePick(index, next);
}

export function toggleHeading(
  index: AssetCategoryIndex,
  pick: CategoryPick,
  heading: CategoryHeading
): CategoryPick {
  const next = new Set(pickedSet(index, pick));
  const ids = heading.options.map((option) => option.id);
  const allTicked = ids.every((id) => next.has(id));
  for (const id of ids) {
    if (allTicked) next.delete(id);
    else next.add(id);
  }
  return normalizePick(index, next);
}

export function headingState(pick: CategoryPick, heading: CategoryHeading): boolean | 'mixed' {
  if (pick === 'all') return true;
  const ticked = heading.options.filter((option) => pick.has(option.id)).length;
  if (ticked === 0) return false;
  return ticked === heading.options.length ? true : 'mixed';
}

export function pickIsAll(pick: CategoryPick): pick is 'all' {
  return pick === 'all';
}

export function blueprintsTicked(index: AssetCategoryIndex, pick: CategoryPick): boolean {
  if (pick === 'all') return index.blueprintOptionIds.size > 0;
  return [...index.blueprintOptionIds].some((id) => pick.has(id));
}

export interface AssetKindFilter {
  index: AssetCategoryIndex;
  pick: CategoryPick;
  blueprints: BlueprintKind;
  blueprintTypeIds?: ReadonlySet<number> | null;
}

export function filterIsOpen(filter: AssetKindFilter): boolean {
  return (
    pickIsAll(filter.pick) &&
    (filter.blueprints === 'any' || !blueprintsTicked(filter.index, filter.pick))
  );
}

export function assetPassesKindFilter(
  asset: { type_id: number; is_blueprint_copy?: boolean },
  filter: AssetKindFilter
): boolean {
  const { index, pick, blueprints } = filter;
  const option = index.optionByTypeId.get(asset.type_id) ?? NOT_ON_MARKET;
  if (pick !== 'all' && !pick.has(option)) return false;
  if (blueprints === 'any' || !blueprintsTicked(index, pick)) return true;
  const isCopy = asset.is_blueprint_copy === true;
  if (blueprints === 'copy') return isCopy;
  return (
    !isCopy &&
    (index.blueprintOptionIds.has(option) || (filter.blueprintTypeIds?.has(asset.type_id) ?? false))
  );
}

export function categoryPickParam(): UrlParamCodec<CategoryPick> {
  return {
    parse: (raw) => {
      if (raw === null) return 'all';
      if (raw === '') return new Set<number>();
      const ids = raw.split(',').map(Number);
      return ids.every((id) => Number.isInteger(id) && (id >= 1 || id === NOT_ON_MARKET))
        ? new Set(ids)
        : 'all';
    },
    serialize: (value) => (value === 'all' ? null : [...value].sort((a, b) => a - b).join(',')),
  };
}

export function blueprintKindParam(): UrlParamCodec<BlueprintKind> {
  return {
    parse: (raw) =>
      BLUEPRINT_KINDS.includes(raw as BlueprintKind) ? (raw as BlueprintKind) : 'any',
    serialize: (value) => (value === 'any' ? null : value),
  };
}

export function pickedCategoryNames(index: AssetCategoryIndex, pick: CategoryPick): string[] {
  if (pick === 'all') return [];
  return index.headings.flatMap((heading) => {
    const ticked = heading.options.filter((option) => pick.has(option.id));
    if (ticked.length === heading.options.length && ticked.length > 0) return [heading.name];
    return ticked.map((option) => option.name);
  });
}

export function activeAssetKindFilters<T extends { cat: CategoryPick; bp: BlueprintKind }>(
  value: T,
  {
    index,
    showBlueprintSelect,
    categoryLabel,
  }: {
    index: AssetCategoryIndex | null;
    showBlueprintSelect: boolean;
    categoryLabel: string;
  },
  t: Translate
): ActiveFilter<T>[] {
  const active: ActiveFilter<T>[] = [];
  if (index && !pickIsAll(value.cat)) {
    const names = pickedCategoryNames(index, value.cat);
    active.push({
      label: categoryLabel,
      value: summarizeFilterValues(names, t),
      clear: (next) => ({ ...next, cat: 'all' }),
    });
  }
  if (showBlueprintSelect && value.bp !== 'any')
    active.push({
      label: t('assets.blueprints.label'),
      value: t(`assets.blueprints.${value.bp}`),
      clear: (next) => ({ ...next, bp: 'any' }),
    });
  return active;
}

export function expandLegacyCategoryIds(
  index: AssetCategoryIndex,
  pick: CategoryPick
): CategoryPick {
  if (pick === 'all') return pick;
  const next = new Set<number>();
  for (const id of pick) {
    const heading = index.headings.find((h) => h.id === id && id !== NOT_ON_MARKET);
    if (heading && !heading.options.some((option) => option.id === id)) {
      for (const option of heading.options) next.add(option.id);
    } else {
      next.add(id);
    }
  }
  return normalizePick(index, next);
}
