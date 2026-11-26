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
            data-tree-item-id={item.typeId}
            aria-current={selectedTypeId === item.typeId ? 'true' : undefined}
            className={`flex min-h-9 min-w-0 flex-1 items-center gap-1.5 truncate py-1 text-left text-xs hover:text-accent md:min-h-0 ${interactiveClassName} ${focusRingInsetClassName} ${
              selectedTypeId === item.typeId ? 'text-accent' : 'text-text-dim'
            }`}
          >
            <TypeIcon typeId={item.typeId} size={32} className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.name}</span>
            {unlisted && (
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
    const categoryCount =
      filtering && depth === 0 ? searchCategories?.countsByRoot.get(group.id) : undefined;
    const flipped = searchCollapsedIds.has(group.id);
    const expanded = !filtering
      ? expandedIds.has(group.id)
      : categoryCount !== undefined && !searchCategories?.openByDefault
        ? flipped
        : !flipped;
    const expandable = children.length > 0 || items.length > 0;

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
