/**
 * The Items page's Asset Category and Blueprints filters (issue #5601).
 *
 * An Asset Category is a top-level market group (GLOSSARY.md); the picker's
 * rows are its direct child market groups. A pick is stored as `'all'` — never
 * as a list — so a market group added later is included, or as the set of
 * ticked option ids.
 */
import type { UrlParamCodec } from '@/lib/urlState';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';
import { marketGroupBranch } from '@/features/corp/assetCategories';

/** Option id of "Not on the market"; market group ids are positive. */
export const NOT_ON_MARKET = -1;

export type CategoryPick = 'all' | ReadonlySet<number>;
export type BlueprintKind = 'any' | 'original' | 'copy';
export const BLUEPRINT_KINDS: readonly BlueprintKind[] = ['any', 'original', 'copy'];

export interface CategoryOption {
  id: number;
  name: string;
}

/** One picker heading: an Asset Category and the rows beneath it. */
export interface CategoryHeading {
  /** The root market group id, or `NOT_ON_MARKET`. */
  id: number;
  name: string;
  /** True for the Blueprints & Reactions heading. */
  blueprints: boolean;
  options: CategoryOption[];
}

export interface AssetCategoryIndex {
  headings: readonly CategoryHeading[];
  /** Option id per market-listed type; an absent type is `NOT_ON_MARKET`. */
  optionByTypeId: ReadonlyMap<number, number>;
  /** Option ids under the Blueprints & Reactions heading. */
  blueprintOptionIds: ReadonlySet<number>;
}

export const EMPTY_CATEGORY_INDEX: AssetCategoryIndex = {
  headings: [],
  optionByTypeId: new Map(),
  blueprintOptionIds: new Set(),
};

const isBlueprintRoot = (name: string) => name.toLowerCase().startsWith('blueprints');

/**
 * The two-level picker tree and every type's option id, from the market
 * catalogue. A root that holds types itself gets a row of its own name.
 */
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

export function allOptionIds(index: AssetCategoryIndex): number[] {
  return index.headings.flatMap((heading) => heading.options.map((option) => option.id));
}

/** A set naming every option reads as `'all'`, so a later-added group is still included. */
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

/** Ticks every option under a heading, or clears them when all are already ticked. */
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

export function pickIsNone(pick: CategoryPick): boolean {
  return pick !== 'all' && pick.size === 0;
}

/** True while a Blueprints & Reactions option is ticked: the Blueprints select only means something then. */
export function blueprintsTicked(index: AssetCategoryIndex, pick: CategoryPick): boolean {
  if (pick === 'all') return index.blueprintOptionIds.size > 0;
  return [...index.blueprintOptionIds].some((id) => pick.has(id));
}

export interface AssetKindFilter {
  index: AssetCategoryIndex;
  pick: CategoryPick;
  blueprints: BlueprintKind;
}

/** True when the filter keeps every asset, so callers can skip the work. */
export function filterIsOpen(filter: AssetKindFilter): boolean {
  return (
    pickIsAll(filter.pick) &&
    (filter.blueprints === 'any' || !blueprintsTicked(filter.index, filter.pick))
  );
}

/** Whether one asset passes the Category pick and, while it applies, the Blueprints select. */
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
  return !isCopy && index.blueprintOptionIds.has(option);
}

/** `cat`: absent = all; `cat=` = none; else comma-separated option ids. */
export function categoryPickParam(): UrlParamCodec<CategoryPick> {
  return {
    parse: (raw) => {
      if (raw === null) return 'all';
      if (raw === '') return new Set<number>();
      const ids = raw.split(',').map(Number);
      return ids.every(Number.isInteger) ? new Set(ids) : 'all';
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
