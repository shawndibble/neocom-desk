import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveNote, LiveStatus } from './LiveStatus';

const meta = {
  title: 'ui/LiveStatus',
  component: LiveStatus,
  tags: ['autodocs'],
  args: { children: '12 results' },
  decorators: [
    (Story) => (
      <div>
        <p className="text-sm text-text-dim">The region below is announced, not shown.</p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LiveStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ResultCount: Story = {};

export const Reannounce: Story = { args: { children: 'Copied', announceKey: 1 } };

export const Silent: Story = { args: { children: null } };

export const VisibleNotice: StoryObj<typeof LiveNote> = {
  render: () => <LiveNote className="text-xs text-warning">Prices are a day old.</LiveNote>,
};
