import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageHeader } from './PageHeader';
import { IconButton } from './IconButton';
import { DataAgeBadge } from './DataAgeBadge';
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

/**
 * A route's `DataAgeBadge` goes in `meta`. It hides below `md`, so the phone
 * story shows the title and actions alone.
 *
 * @summary Title with a `DataAgeBadge` in `meta`, the shape of every ESI-backed route.
 */
export const WithDataAge: Story = {
  args: {
    title: 'Wallet',
    meta: <DataAgeBadge date={new Date(Date.now() - 12 * 60_000)} />,
    actions: <IconButton label="Refresh" icon={<Icon.Refresh />} />,
  },
};

/** @summary The same header at 390 wide: actions keep a 44px touch target. */
export const Phone: Story = {
  ...WithMetaAndActions,
  globals: { viewport: { value: 'phone390', isRotated: false } },
};
