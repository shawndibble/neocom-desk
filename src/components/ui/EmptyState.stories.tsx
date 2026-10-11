import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState } from './EmptyState';
import { Button } from './Button';

const meta = {
  title: 'ui/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A title and a hint. */
export const WithHint: Story = {
  args: { title: 'No jobs running', hint: 'Start a job in game and it shows up here.' },
};

/** @summary An empty state that offers the action resolving it. */
export const WithAction: Story = {
  args: {
    title: 'No plans yet',
    hint: 'Create a plan to see its materials.',
    action: <Button variant="primary">New plan</Button>,
  },
};
