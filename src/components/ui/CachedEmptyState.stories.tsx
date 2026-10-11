import type { Meta, StoryObj } from '@storybook/react-vite';
import { CachedEmptyState } from './CachedEmptyState';

/**
 * Picks the empty copy by where the list came from. Cue (§6c): "nothing cached,
 * reconnect" is not "nothing there"; only a fresh fetch may say none.
 *
 * @summary Empty state that tells a stale or missing read from a genuinely empty list.
 */
const meta = {
  title: 'ui/CachedEmptyState',
  component: CachedEmptyState,
  tags: ['autodocs'],
  args: {
    title: 'Nothing cached',
    hint: 'Reconnect to load your contracts.',
    fetchedTitle: 'No contracts',
  },
} satisfies Meta<typeof CachedEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Unknown state (§6c): no read at all, so it asks the pilot to reconnect. */
export const NeverFetched: Story = { args: { result: null } };

/** @summary Unknown state (§6c): served from cache, so the list may be out of date. */
export const FromCache: Story = { args: { result: { fromCache: true } } };

/** @summary Empty state (§4): a fetch just succeeded and found nothing, a plain "none". */
export const FetchedEmpty: Story = { args: { result: { fromCache: false } } };
