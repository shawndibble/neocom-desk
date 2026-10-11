import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageHeader } from './PageHeader';
import { IconButton } from './IconButton';
import * as Icon from './icons';

const meta = {
  title: 'ui/PageHeader',
  component: PageHeader,
  tags: ['autodocs'],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Just the route's `<h1>`. */
export const TitleOnly: Story = { args: { title: 'Overview' } };

/** @summary Title with a meta note beside it and an action at the right. */
export const WithMetaAndActions: Story = {
  args: {
    title: 'Assets',
    meta: <span className="text-xs text-text-dim">1,204 items</span>,
    actions: <IconButton label="Refresh" icon={<Icon.Refresh />} />,
  },
};
