import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageHeader } from './PageHeader';
import { IconButton } from './IconButton';
import { DataAgeBadge } from './DataAgeBadge';
import * as Icon from './icons';
import { Button } from './Button';
import { HeaderMoreMenu } from './HeaderMoreMenu';
import { DropdownMenuItem } from './DropdownMenu';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';

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

const picker = (
  <CharacterFilterControl
    activeCharacterId={null}
    value="all"
    onChange={() => {}}
    characterCount={4}
    missingNames={['Bob Vale']}
  />
);

/**
 * The cluster's fixed order: picker → text buttons → icon buttons (Refresh)
 * → ⋮ → bell. The picker takes the header's tier on its own, so it is the
 * same height as the `IconButton`s beside it: 36px here, 44px on a phone.
 *
 * @summary `scope` slot: the Character picker first in the cluster, level with the icon buttons, one line.
 */
export const WithScope: Story = {
  args: {
    title: 'Market orders',
    meta: <DataAgeBadge date={new Date(Date.now() - 12 * 60_000)} />,
    scope: picker,
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

/**
 * A page decides in JS which actions fit: at phone width the text action
 * moves into the ⋮ and the row stays on one line; the long title truncates.
 *
 * @summary `scope` at 390 wide: picker, Refresh, ⋮ and bell on one line; the title truncates.
 */
export const WithScopePhone: Story = {
  args: {
    title: 'Market orders and history',
    scope: picker,
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
