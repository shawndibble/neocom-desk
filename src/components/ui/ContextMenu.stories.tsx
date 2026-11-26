import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './ContextMenu';

const meta = {
  title: 'ui/ContextMenu',
  component: ContextMenu,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="h-64 w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const area = (
  <ContextMenuTrigger asChild>
    <div className="rounded-sm border border-line-bright p-6 text-text-dim">
      Right-click or touch and hold here
    </div>
  </ContextMenuTrigger>
);

export const Closed: Story = { args: { children: area } };

export const Open: Story = {
  args: {
    children: (
      <>
        {area}
        <ContextMenuContent>
          <ContextMenuItem>Rename</ContextMenuItem>
          <ContextMenuItem>Duplicate</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Delete</ContextMenuItem>
        </ContextMenuContent>
      </>
    ),
  },
};

export const LabelAndCheckbox: Story = {
  args: {
    children: (
      <>
        {area}
        <ContextMenuContent>
          <ContextMenuLabel>Range</ContextMenuLabel>
          <ContextMenuItem>30 days</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem checked>Show on phone</ContextMenuCheckboxItem>
        </ContextMenuContent>
      </>
    ),
  },
};
