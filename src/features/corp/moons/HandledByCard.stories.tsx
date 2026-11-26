import type { Meta, StoryObj } from '@storybook/react-vite';
import { HandledByCard } from './HandledByCard';
import { fixtureView } from './ownerViewFixtures';

const meta = {
  title: 'corp/HandledByCard',
  component: HandledByCard,
  args: {
    summary: fixtureView({ status: 'left', leftAt: Date.UTC(2026, 9, 12) }).summary,
    name: 'Brass Meridian Logistics',
    canDismiss: true,
    onDismiss: async () => undefined,
  },
} satisfies Meta<typeof HandledByCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Owed: Story = {};

export const Settled: Story = {
  args: {
    summary: fixtureView({
      status: 'left',
      leftAt: Date.UTC(2026, 9, 12),
      balanceKind: 'even',
      balanceIsk: 0,
    }).summary,
  },
};
