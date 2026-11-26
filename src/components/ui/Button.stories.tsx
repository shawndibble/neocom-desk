import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const meta = {
  title: 'ui/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Save plan' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary' } };

export const Ghost: Story = { args: { variant: 'ghost' } };

export const Danger: Story = { args: { variant: 'danger', children: 'Delete plan' } };

export const Loading: Story = { args: { variant: 'primary', loading: true } };

export const WrappingLabel: Story = {
  args: {
    variant: 'warning',
    size: 'sm',
    wrap: true,
    className: 'w-64',
    children: 'Tell Bureau of Unified Harvesting it went to Star Tail Industries',
  },
};
