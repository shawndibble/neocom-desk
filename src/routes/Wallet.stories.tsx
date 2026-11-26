import type { Meta, StoryObj } from '@storybook/react-vite';
import { Wallet } from './Wallet';

const meta = {
  title: 'pages/Wallet',
  component: Wallet,
  parameters: { layout: 'fullscreen', shell: { path: '/wallet/balance' } },
} satisfies Meta<typeof Wallet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Balance: Story = {};

export const BalancePhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
