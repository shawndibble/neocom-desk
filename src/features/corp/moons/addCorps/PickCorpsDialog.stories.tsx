import type { Meta, StoryObj } from '@storybook/react-vite';
import { CORPS } from './addCorpsFixtures';
import { PickCorpsDialog } from './PickCorpsDialog';

/** @summary Step 1 of Add my other corps: tick the corps that own moons, with Hidden corps in the footer. */
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

/** @summary Nothing ticked: the app cannot see moons before a sign-in. */
export const NothingTicked: Story = {};

/** @summary Ten ticked, ready to continue. */
export const Ticked: Story = {
  args: { initialSelected: CORPS.slice(0, 10).map((c) => c.corporationId) },
};

/** @summary The New corp banner's Connect it: that corp is ticked. */
export const FromBanner: Story = { args: { initialSelected: [CORPS[2]!.corporationId] } };

/** @summary Nothing hidden, so no Hidden corps button. */
export const NoneHidden: Story = { args: { hiddenCount: 0, corps: CORPS.slice(0, 3) } };

/** @summary Still looking the corps up. */
export const Loading: Story = { args: { corps: [], loading: true } };
