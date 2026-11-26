import type { Meta, StoryObj } from '@storybook/react-vite';
import { CORPS } from './addCorpsFixtures';
import { PickCorpsDialog } from './PickCorpsDialog';

const meta = {
  title: 'corp/PickCorpsDialog',
  component: PickCorpsDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    corps: CORPS.slice(0, 10),
    hiddenCount: 2,
    onDontAsk: () => {},
    onOpenHidden: () => {},
    onContinue: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof PickCorpsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NothingTicked: Story = {};

export const Ticked: Story = {
  args: { initialSelected: CORPS.slice(0, 10).map((c) => c.corporationId) },
};

export const FromBanner: Story = { args: { initialSelected: [CORPS[2]!.corporationId] } };

export const NoneHidden: Story = { args: { hiddenCount: 0, corps: CORPS.slice(0, 3) } };

export const Loading: Story = { args: { corps: [], loading: true } };
