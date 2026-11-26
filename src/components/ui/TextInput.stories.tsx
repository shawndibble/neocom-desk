import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextInput } from './TextInput';

const meta = {
  title: 'ui/TextInput',
  component: TextInput,
  tags: ['autodocs'],
  args: { 'aria-label': 'Plan name', placeholder: 'Rifter run' },
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = { args: { size: 'sm' } };

export const Filled: Story = { args: { defaultValue: 'Rifter run' } };

export const Invalid: Story = { args: { defaultValue: 'x', 'aria-invalid': true } };

export const Disabled: Story = { args: { disabled: true, defaultValue: 'Locked' } };

export const NoLabel: Story = {
  tags: ['!manifest'],
  args: { 'aria-label': undefined },
};
