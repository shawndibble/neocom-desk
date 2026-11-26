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

const meta = {
  title: 'ui/DropdownMenu',
  component: DropdownMenu,
  tags: ['autodocs'],
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

export const Closed: Story = {
  args: { children: trigger },
};

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
