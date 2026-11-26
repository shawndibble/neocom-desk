import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchInput } from './SearchInput';

const meta = {
  title: 'ui/SearchInput',
  component: SearchInput,
  tags: ['autodocs'],
  args: { 'aria-label': 'Search', placeholder: 'Search', className: 'w-72' },
} satisfies Meta<typeof SearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const Filled: Story = { args: { defaultValue: 'tritanium' } };
