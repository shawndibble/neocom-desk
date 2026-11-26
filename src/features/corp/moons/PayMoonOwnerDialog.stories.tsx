import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayMoonOwnerDialog } from './PayMoonOwnerDialog';

const PAY_SCOPES = ['esi-ui.open_window.v1'] as const;

const meta = {
  title: 'corp/PayMoonOwnerDialog',
  component: PayMoonOwnerDialog,
  parameters: {
    layout: 'fullscreen',
    shell: { path: '/corp/moons/moon-owners', scopes: PAY_SCOPES },
  },
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

export const Default: Story = {};

export const AddByHand: Story = { args: { manual: true } };
