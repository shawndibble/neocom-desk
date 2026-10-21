import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayMoonOwnerDialog } from './PayMoonOwnerDialog';

/** @summary Pay… a moon owner: Settle up's shell with one row, the whole-ISK balance, a generated reason and a before → after line. */
const meta = {
  title: 'corp/PayMoonOwnerDialog',
  component: PayMoonOwnerDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    ownerName: 'Ashfall Mining Collective',
    payee: { id: 98, name: 'Ashfall Mining Collective' },
    balance: 13_024_480.6,
    period: { from: '2026-10-01', to: '2026-10-17' },
    onClose: () => {},
    onRecord: async () => {},
  },
} satisfies Meta<typeof PayMoonOwnerDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The whole balance, ready to send and copy. */
export const Default: Story = {};

/** @summary Added by hand: no figure to send, the amount is typed. */
export const AddByHand: Story = { args: { manual: true } };
