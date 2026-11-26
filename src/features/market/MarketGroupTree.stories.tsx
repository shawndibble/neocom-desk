import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';
import { MarketGroupTree } from './MarketGroupTree';
import { filterMarketTree } from './marketTree';
import type { NoOrdersCue } from './regionMarketTypes';

const GROUPS: MarketGroupNode[] = [
  { id: 4, name: 'Ships', parentId: null, hasTypes: false },
  { id: 1361, name: 'Frigates', parentId: 4, hasTypes: false },
  { id: 64, name: 'Standard Frigates', parentId: 1361, hasTypes: true },
  { id: 1838, name: 'Special Edition Frigates', parentId: 1361, hasTypes: true },
];

const TYPES: MarketTypeEntry[] = [
  { typeId: 608, name: 'Atron', marketGroupId: 64, volume: 22_500 },
  { typeId: 603, name: 'Merlin', marketGroupId: 64, volume: 16_500 },
  { typeId: 587, name: 'Rifter', marketGroupId: 64, volume: 27_289 },
  { typeId: 11940, name: 'Gold Magnate', marketGroupId: 1838, volume: 16_500 },
  { typeId: 33397, name: 'Imp', marketGroupId: 1838, volume: 16_500 },
  { typeId: 11942, name: 'Silver Magnate', marketGroupId: 1838, volume: 16_500 },
];

const LISTED = new Set([608, 603, 587, 33397]);
const NO_ORDERS: NoOrdersCue = {
  regionName: 'The Forge',
  hasOrders: (typeId) => LISTED.has(typeId),
};

function byParent(groups: readonly MarketGroupNode[]) {
  const map = new Map<number | null, MarketGroupNode[]>();
  for (const group of groups) map.set(group.parentId, [...(map.get(group.parentId) ?? []), group]);
  return map;
}

function byGroup(types: readonly MarketTypeEntry[]) {
  const map = new Map<number, MarketTypeEntry[]>();
  for (const type of types)
    map.set(type.marketGroupId, [...(map.get(type.marketGroupId) ?? []), type]);
  return map;
}

const childrenByParent = byParent(GROUPS);
const typesByGroup = byGroup(TYPES);

const meta = {
  title: 'market/MarketGroupTree',
  component: MarketGroupTree,
  args: {
    groups: GROUPS,
    childrenByParent,
    typesByGroup,
    filterResult: null,
    expandedIds: new Set([4, 1361, 64, 1838]),
    searchCollapsedIds: new Set<number>(),
    searchCategories: null,
    onToggle: () => {},
    onSelect: () => {},
    selectedTypeId: null,
    noOrders: NO_ORDERS,
  },
  decorators: [
    (Story) => (
      <div className="w-80 bg-panel p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarketGroupTree>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MixedBranch: Story = {};

export const SelectedUnlisted: Story = { args: { selectedTypeId: 11940 } };

export const SearchResults: Story = {
  args: {
    filterResult: filterMarketTree(GROUPS, TYPES, 'magnate'),
  },
};

export const NoCue: Story = { args: { noOrders: null } };

export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-56">
        <Story />
      </div>
    ),
  ],
};
