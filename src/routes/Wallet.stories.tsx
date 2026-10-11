import type { Meta, StoryObj } from '@storybook/react-vite';
import { Wallet } from './Wallet';

const meta = {
  title: 'pages/Wallet',
  component: Wallet,
  parameters: { layout: 'fullscreen', shell: { path: '/wallet/balance' } },
} satisfies Meta<typeof Wallet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Wallet › Balance for the signed-in Character, in the desktop shell (rail, header, tabs). */
export const Balance: Story = {};

/** @summary The same page in the phone shell: bottom tabs instead of the rail. */
export const BalancePhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
