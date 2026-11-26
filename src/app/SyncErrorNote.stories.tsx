import type { Meta, StoryObj } from '@storybook/react-vite';
import { SyncErrorNote } from './SyncErrorNote';

const meta = {
  title: 'app/SyncErrorNote',
  component: SyncErrorNote,
  tags: ['autodocs'],
  args: { online: true, status: { state: 'error', lastSyncedAt: null, error: 'Network error' } },
} satisfies Meta<typeof SyncErrorNote>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Failed: Story = {};
