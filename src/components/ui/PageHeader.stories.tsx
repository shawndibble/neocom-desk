import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageHeader } from './PageHeader';
import { IconButton } from './IconButton';
import { DataAgeBadge } from './DataAgeBadge';
import * as Icon from './icons';
import { Button } from './Button';
import { HeaderMoreMenu } from './HeaderMoreMenu';
import { DropdownMenuItem } from './DropdownMenu';
import { MINUTE_MS } from '@/lib/age';

const meta = {
  title: 'ui/PageHeader',
  component: PageHeader,
  tags: ['autodocs'],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = { args: { title: 'Overview' } };

export const WithMetaAndActions: Story = {
  args: {
    title: 'Assets',
    meta: <span className="text-xs text-text-dim">1,204 items</span>,
    actions: <IconButton label="Refresh" icon={<Icon.Refresh />} />,
  },
};

export const WithDataAge: Story = {
  args: {
    title: 'Wallet',
    meta: <DataAgeBadge date={new Date(Date.now() - 12 * MINUTE_MS)} />,
    actions: <IconButton label="Refresh" icon={<Icon.Refresh />} />,
  },
};

export const Phone: Story = {
  ...WithMetaAndActions,
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

const scopeStandIn = (
  <button
    type="button"
    aria-label="All characters"
    className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-xs border border-line bg-panel-2 px-1 text-text-dim"
  >
    <Icon.AllCharacters aria-hidden="true" />
    <Icon.Expanded aria-hidden="true" className="size-3" />
  </button>
);

export const WithScope: Story = {
  args: {
    title: 'Market orders',
    meta: <DataAgeBadge date={new Date(Date.now() - 12 * MINUTE_MS)} />,
    scope: scopeStandIn,
    actions: (
      <>
        <Button variant="ghost">Export</Button>
        <IconButton label="Refresh" icon={<Icon.Refresh />} />
        <HeaderMoreMenu>
          <DropdownMenuItem>Page settings…</DropdownMenuItem>
          <DropdownMenuItem>Column presets…</DropdownMenuItem>
        </HeaderMoreMenu>
      </>
    ),
  },
};

export const WithScopePhone: Story = {
  args: {
    title: 'Market orders and history',
    scope: scopeStandIn,
    actions: (
      <>
        <IconButton label="Refresh" icon={<Icon.Refresh />} />
        <HeaderMoreMenu>
          <DropdownMenuItem>Export…</DropdownMenuItem>
          <DropdownMenuItem>Page settings…</DropdownMenuItem>
        </HeaderMoreMenu>
      </>
    ),
  },
  globals: { viewport: { value: 'phone390', isRotated: false } },
};
