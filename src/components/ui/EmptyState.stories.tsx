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

/** @summary Decorative icon (§4): a faint glyph above the title; `aria-hidden`. */
export const WithIcon: Story = {
  args: { title: 'No alerts', hint: 'Price alerts you set show up here.', icon: <Icon.Pending /> },
};

/** @summary Title only: the shortest form, for a small panel. */
export const TitleOnly: Story = { args: { title: 'No orders' } };
