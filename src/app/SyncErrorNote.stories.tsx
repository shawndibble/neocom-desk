import type { Meta, StoryObj } from '@storybook/react-vite';
import { SyncErrorNote } from './SyncErrorNote';

/**
 * Visible "Sync error" text, with a live region. Cue (§7): an error is words
 * in danger red, not only the nav's dot.
 *
 * @summary Inline note shown when cloud sync fails.
 */
const meta = {
  title: 'app/SyncErrorNote',
  component: SyncErrorNote,
  tags: ['autodocs'],
  args: { online: true, status: { state: 'error', lastSyncedAt: null, error: 'Network error' } },
} satisfies Meta<typeof SyncErrorNote>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Error state (§7): a failed sync names itself in text. */
export const Failed: Story = {};
