import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchInput } from './SearchInput';

/**
 * @summary Search box: field chrome plus a magnifier at the start, a native `type="search"` input.
 */
const meta = {
  title: 'ui/SearchInput',
  component: SearchInput,
  tags: ['autodocs'],
  args: { 'aria-label': 'Search items', placeholder: 'Search items' },
} satisfies Meta<typeof SearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Resting search box: `CaretDown` is not used, so it reads as a text field, not a list picker (§6c cue vocabulary). */
export const Default: Story = {};

/** @summary With a query typed in. */
export const WithQuery: Story = { args: { defaultValue: 'Tritanium' } };

/** @summary Disabled (§6c States): `opacity-40` and `cursor-not-allowed`. */
export const Disabled: Story = { args: { disabled: true } };
