import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './DropdownMenu';

/**
 * @summary Click-triggered command menu on Radix (docs/adr/0004). Cue: the ⋮
 * `IconButton` opens a row's or table's action menu (DESIGN.md §6c cue
 * vocabulary).
 */
const meta = {
  title: 'ui/DropdownMenu',
  component: DropdownMenu,
  tags: ['autodocs'],
  // The panel portals to the body, so give the canvas room to show it.
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="h-72 w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const trigger = (
  <DropdownMenuTrigger asChild>
    <IconButton icon={<Icon.More />} label="More actions" size="row" variant="plain" />
  </DropdownMenuTrigger>
);

/**
 * @summary The row menu (§6c "⋮: only where it holds two or more real actions"): an open menu with
 * two actions and a separator before the destructive one.
 */
export const RowActions: Story = {
  args: {
    defaultOpen: true,
    children: (
      <>
        {trigger}
        <DropdownMenuContent align="start">
          <DropdownMenuItem>Rename</DropdownMenuItem>
          <DropdownMenuItem>Duplicate</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </>
    ),
  },
};

/** @summary Closed at rest: only the ⋮ trigger shows, as it does on a table row. */
export const Closed: Story = {
  args: { children: trigger },
};

/** @summary A table's Columns menu (§6c): ticked items toggle independently and the menu stays open. */
export const CheckboxItems: Story = {
  args: {
    defaultOpen: true,
    children: (
      <>
        {trigger}
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Columns</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked onSelect={(e) => e.preventDefault()}>
            Price
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={false} onSelect={(e) => e.preventDefault()}>
            Volume
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </>
    ),
  },
};

/** @summary A pick-one choice (§6c, a module's state): radio items, the current one ticked. */
export const RadioChoice: Story = {
  args: {
    defaultOpen: true,
    children: (
      <>
        {trigger}
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value="online">
            <DropdownMenuRadioItem value="online">Online</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="offline">Offline</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </>
    ),
  },
};

/** @summary A submenu: a side panel beside the menu, items in place on a phone (§6c row actions). */
export const WithSubmenu: Story = {
  args: {
    defaultOpen: true,
    children: (
      <>
        {trigger}
        <DropdownMenuContent align="start">
          <DropdownMenuItem>Show info</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Export table</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>CSV</DropdownMenuItem>
              <DropdownMenuItem>JSON</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </>
    ),
  },
};

/**
 * @summary Anti-pattern (§6c Restraint): a ⋮ menu holding a single action. Put that action on the
 * row (or let the row click carry it) and add no menu.
 */
export const SingleActionMenu: Story = {
  tags: ['!manifest'],
  args: {
    defaultOpen: true,
    children: (
      <>
        {trigger}
        <DropdownMenuContent align="start">
          <DropdownMenuItem>Open</DropdownMenuItem>
        </DropdownMenuContent>
      </>
    ),
  },
};
