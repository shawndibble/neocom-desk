import type { Meta, StoryObj } from '@storybook/react-vite';
import { CachedEmptyState } from './CachedEmptyState';

const meta = {
  title: 'ui/CachedEmptyState',
  component: CachedEmptyState,
  tags: ['autodocs'],
  args: {
    title: 'Nothing cached',
    hint: 'Reconnect to load your contracts.',
    fetchedTitle: 'No contracts',
  },
} satisfies Meta<typeof CachedEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NeverFetched: Story = { args: { result: null } };

export const FromCache: Story = { args: { result: { fromCache: true } } };

export const FetchedEmpty: Story = {
  args: {
    result: { fromCache: false },
    fetchedHint: 'Contracts you issue or accept show here: item trades, couriers and auctions.',
  },
};
