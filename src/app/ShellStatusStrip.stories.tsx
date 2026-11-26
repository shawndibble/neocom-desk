import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/ui';
import { ShellStatusStrip } from './ShellStatusStrip';

const meta = {
  title: 'app/ShellStatusStrip',
  component: ShellStatusStrip,
  tags: ['autodocs'],
} satisfies Meta<typeof ShellStatusStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

const relogin = (
  <div
    data-status-item
    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5"
  >
    <p className="min-w-48 flex-1 text-xs">
      <span className="font-semibold text-warning">Ada Vance: log in again</span>
      <span className="text-text-dim"> EVE refused this request.</span>
    </p>
    <div className="flex items-center gap-1.5">
      <Button variant="ghost" size="sm">
        Log in again
      </Button>
      <Button size="sm">Dismiss</Button>
    </div>
  </div>
);

export const ReloginAndSyncError: Story = {
  args: {
    children: (
      <>
        {relogin}
        <p data-status-item className="px-3 py-1.5 text-[0.6875rem] text-danger uppercase">
          Sync error
        </p>
      </>
    ),
  },
};

export const Healthy: Story = { args: { children: null } };
