import type { Meta, StoryObj } from '@storybook/react-vite';
import { Spinner } from './Spinner';

const meta = {
  title: 'ui/Spinner',
  component: Spinner,
  tags: ['autodocs'],
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = { args: { size: 'sm' } };

export const Large: Story = { args: { size: 'lg', label: 'Loading plan' } };

export const Delayed: Story = { args: { delayMs: 200 } };

export const PageBlock: Story = { args: { block: 'page' } };

export const PanelBlock: Story = { args: { block: 'panel' } };
