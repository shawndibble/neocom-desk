import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoadFailedState } from './LoadFailedState';

/**
 * A read that failed is not an empty list. Cue (§6c): "Couldn't load" with Retry
 * where `EmptyState` would have said "none". Use `CachedEmptyState` when the read
 * came back (from cache or fresh); this is for when it did not come back at all.
 *
 * @summary Empty state for a read that failed or could not be reached, with Retry; never worded as "none".
 */
const meta = {
  title: 'ui/LoadFailedState',
  component: LoadFailedState,
  tags: ['autodocs'],
  args: { onRetry: () => {} },
} satisfies Meta<typeof LoadFailedState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Default copy: "Try again" online, "Connect once" offline (follows the browser). */
export const Default: Story = { args: {} };

/** @summary A named source that could not be reached. */
export const NamedSource: Story = {
  args: {
    title: "Couldn't reach the contract index",
    hint: 'Nothing is cached yet.',
  },
};
