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

/** @summary The one search box, with a leading magnifier. Width comes from `className`. */
export const Basic: Story = {};

/** @summary With a typed value. */
export const Filled: Story = { args: { defaultValue: 'tritanium' } };
