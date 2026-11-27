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

/**
 * @summary Right-click (touch-and-hold) menu on Radix (docs/adr/0004). §6c: it is the second way
 * into a row's actions; the visible ⋮ button is the first, so the same items must be reachable
 * there too (WCAG 2.1.1).
 */
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

/** @summary Closed at rest: the surface gives no cue by itself, which is why a ⋮ button must back it up (§6c). */
export const Closed: Story = { args: { children: area } };

/**
 * @summary The open menu (§6c row menu: two or more real actions, destructive one set apart by a
 * separator).
 */
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

/** @summary A captioned group and a toggle: the Overview widget card's menu (Show on phone is the toggle). */
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
