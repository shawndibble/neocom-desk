import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';
import { MarketGroupTree, type MarketGroupTreeProps } from './MarketGroupTree';
import { filterMarketTree } from './marketTree';

const GROUPS: MarketGroupNode[] = [{ id: 1, name: 'Frigates', parentId: null, hasTypes: true }];
const TYPES: MarketTypeEntry[] = [
  { typeId: 587, name: 'Rifter', marketGroupId: 1, volume: 1 },
  { typeId: 11940, name: 'Gold Magnate', marketGroupId: 1, volume: 1 },
];

function renderTree(over: Partial<MarketGroupTreeProps> = {}) {
  return render(
    <MarketGroupTree
      groups={GROUPS}
      childrenByParent={new Map([[null, GROUPS]])}
      typesByGroup={new Map([[1, TYPES]])}
      filterResult={null}
      expandedIds={new Set([1])}
      searchCollapsedIds={new Set()}
      searchCategories={null}
      onToggle={() => {}}
      onSelect={() => {}}
      selectedTypeId={null}
      noOrders={{ regionName: 'The Forge', hasOrders: (typeId) => typeId === 587 }}
      {...over}
    />
  );
}

describe('MarketGroupTree no-orders cue (issue #6200)', () => {
  it('marks an unlisted leaf with its region and leaves a listed one bare', () => {
    renderTree();
    expect(
      screen.getByRole('button', { name: 'Gold Magnate No orders in The Forge' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rifter' })).toBeTruthy();
  });

  it('marks a search match the same way, Best match included', () => {
    renderTree({ filterResult: filterMarketTree(GROUPS, TYPES, 'gold magnate') });
    expect(screen.getAllByText('No orders in The Forge')).toHaveLength(1);
    expect(screen.getByText('Best match')).toBeTruthy();
  });

  it('draws nothing without a cue', () => {
    renderTree({ noOrders: null });
    expect(screen.queryByText(/No orders in/)).toBeNull();
  });
});
