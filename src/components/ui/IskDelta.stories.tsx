import type { Meta, StoryObj } from '@storybook/react-vite';
import { IskDelta } from './IskDelta';

const meta = {
  title: 'ui/IskDelta',
  component: IskDelta,
  tags: ['autodocs'],
  args: { amount: 1250000 },
} satisfies Meta<typeof IskDelta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gain: Story = {};

export const Loss: Story = { args: { amount: -340000 } };

export const Zero: Story = { args: { amount: 0 } };

export const WholeIsk: Story = { args: { amount: 987654.4, decimals: 0 } };
