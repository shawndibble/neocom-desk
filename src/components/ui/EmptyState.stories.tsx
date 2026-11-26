import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState } from './EmptyState';
import { Button } from './Button';
import * as Icon from './icons';

const meta = {
  title: 'ui/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHint: Story = {
  args: { title: 'No jobs running', hint: 'Start a job in game and it shows up here.' },
};

export const WithAction: Story = {
  args: {
    title: 'No plans yet',
    hint: 'Create a plan to see its materials.',
    action: <Button variant="primary">New plan</Button>,
  },
};

export const WithIcon: Story = {
  args: { title: 'No alerts', hint: 'Price alerts you set show up here.', icon: <Icon.Pending /> },
};

export const TitleOnly: Story = { args: { title: 'No orders' } };
