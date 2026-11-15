/** The Market Browser's Market Group tree: groups, their items, and search matches. */
import { useTranslation } from 'react-i18next';
import { Caret, TypeIcon } from '@/components/ui';
import { focusRingInsetClassName, interactiveClassName } from '@/components/ui/controlStyles';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';
import type { MarketTreeFilterResult, SearchCategorySummary } from './marketTree';
import type { NoOrdersCue } from './regionMarketTypes';

export interface MarketGroupTreeProps {
  groups: readonly MarketGroupNode[];
  childrenByParent: ReadonlyMap<number | null, MarketGroupNode[]>;
  typesByGroup: ReadonlyMap<number, MarketTypeEntry[]>;
  filterResult: MarketTreeFilterResult | null;
  expandedIds: ReadonlySet<number>;
  searchCollapsedIds: ReadonlySet<number>;
  searchCategories: SearchCategorySummary | null;
  onToggle: (id: number) => void;
  onSelect: (typeId: number) => void;
  selectedTypeId: number | null;
  /**
   * Marks a leaf whose type has no order in the browser's one region (#6200).
   * Null for no cue: loading, failed, or the browser spans regions.
   */
  noOrders?: NoOrdersCue | null;
}

export function MarketGroupTree({
  childrenByParent,
  typesByGroup,
  filterResult,
  expandedIds,
  searchCollapsedIds,
  searchCategories,
  onToggle,
  onSelect,
  selectedTypeId,
  noOrders = null,
}: MarketGroupTreeProps) {
  const { t } = useTranslation();
  const filtering = filterResult !== null;

  function renderItem(item: MarketTypeEntry, itemDepth: number) {
    const unlisted = noOrders !== null && !noOrders.hasOrders(item.typeId);
    return (
      <li key={item.typeId}>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => onSelect(item.typeId)}
            style={{ paddingLeft: `${itemDepth * 0.75 + 0.75}rem` }}
            // Read back on Back-to-finder (issue #1485), to return focus
            // to the row that opened the item panel — `data-` rather
            // than an id/ref, since the tree fully unmounts/remounts
            // whenever a search collapses or re-expands a group.
            data-tree-item-id={item.typeId}
            aria-current={selectedTypeId === item.typeId ? 'true' : undefined}
            className={`flex min-h-9 min-w-0 flex-1 items-center gap-1.5 truncate py-1 text-left text-xs hover:text-accent md:min-h-0 ${interactiveClassName} ${focusRingInsetClassName} ${
              selectedTypeId === item.typeId ? 'text-accent' : 'text-text-dim'
            }`}
          >
            <TypeIcon typeId={item.typeId} size={32} className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.name}</span>
            {unlisted && (
              // Meta text at the row's right edge: it states an absence, so
              // it is plain text (never a chip) and the row stays at full
              // contrast (DESIGN.md §6c "No orders in {Region}"). It is part
              // of the row's name, so a screen reader hears it with the item;
              // the space keeps the two apart there. In a narrow tree the cue
              // gives way first (`shrink-[100]`): the item's name matters more.
              <>
                {' '}
                <span className="ml-auto min-w-16 shrink-[100] truncate pl-2 pr-2 text-[0.6875rem] text-text-dim">
                  {t('market.noOrdersInRegion', { regionName: noOrders.regionName })}
                </span>
              </>
            )}
          </button>
        </div>
      </li>
    );
  }

  function renderGroup(group: MarketGroupNode, depth: number) {
    if (filtering && !filterResult.visibleGroupIds.has(group.id)) return null;
    const children = childrenByParent.get(group.id) ?? [];
    const items = filtering
      ? (filterResult.matchedTypesByGroup.get(group.id) ?? [])
      : group.hasTypes
        ? (typesByGroup.get(group.id) ?? [])
        : [];
    // Matched branches default open (marketTree.ts), but that default is just
    // a starting point: `onToggle` below lets the user collapse/re-expand any
    // group while search is active, independent of which items still match.
    // Search only ever prunes *items*, never forces expand state.
    // The one exception is a top-level category: those start collapsed when
    // the matches are too many to fit (`searchCategories.openByDefault`), so
    // the set holds flips from that default rather than only collapses.
    const categoryCount =
      filtering && depth === 0 ? searchCategories?.countsByRoot.get(group.id) : undefined;
    const flipped = searchCollapsedIds.has(group.id);
    const expanded = !filtering
      ? expandedIds.has(group.id)
      : categoryCount !== undefined && !searchCategories?.openByDefault
        ? flipped
        : !flipped;
    const expandable = children.length > 0 || items.length > 0;

    // `min-h-9 md:min-h-0` gives a thumb the 36px floor on the leaf row and
    // on an expandable header — a disabled header is inert, so it stays dense
    // rather than spending 36px of the phone's scrollport on nothing (55 of
    // the catalogue's groups are childless and itemless, five in a row under
    // ECCM alone). Not `controlHeightClassName.md`: its `md:h-9` would grow
    // desktop's 24px rows too, which this fix must not do.
    return (
      <li key={group.id}>
        <button
          type="button"
          disabled={!expandable}
          aria-expanded={expandable ? expanded : undefined}
          onClick={() => onToggle(group.id)}
          style={{ paddingLeft: `${depth * 0.75}rem` }}
          className={`flex w-full items-center gap-1.5 py-1 text-left text-xs text-text hover:text-accent disabled:hover:text-text ${interactiveClassName} ${focusRingInsetClassName} ${
            expandable ? 'min-h-9 md:min-h-0' : ''
          }`}
        >
          {expandable && <Caret expanded={expanded} />}
          <span className={expandable ? '' : 'pl-3'}>
            {categoryCount === undefined
              ? group.name
              : t('market.categoryHeader', { name: group.name, count: categoryCount })}
          </span>
        </button>
        {expanded && (children.length > 0 || items.length > 0) && (
          <ul>
            {children.map((child) => renderGroup(child, depth + 1))}
            {items.map((item) => renderItem(item, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  const roots = childrenByParent.get(null) ?? [];
  return (
    // Below `lg` a flat cap. From `lg` the finder panel is a viewport-bounded
    // flex column and the tree is its flexible part: it takes whatever the
    // search and the Quickbar leave, so neither is pushed off-screen.
    <div className="max-h-[32rem] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
      {filterResult?.bestMatch && (
        <div className="mb-2 border-b border-line pb-2">
          <p className="pb-1 text-[0.6875rem] text-text-dim uppercase">{t('market.bestMatch')}</p>
          <ul>{renderItem(filterResult.bestMatch, 0)}</ul>
        </div>
      )}
      <ul>{roots.map((root) => renderGroup(root, 0))}</ul>
    </div>
  );
}
