import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  MenuCheckboxItem,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  RowActionsMenu,
  RowMoreActions,
} from './RowActions';

/**
 * @summary One item list drawn two ways (docs/DESIGN.md §6c): right-click or touch-and-hold on the
 * row, and the visible ⋮ button. Write items with the `Menu*` pieces so both menus read one list.
 */
const meta = {
  title: 'ui/RowActionsMenu',
  component: RowActionsMenu,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof RowActionsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A card with the ⋮ at its header's edge; right-click anywhere on it opens the same items. */
export const CardMenu: Story = {
  args: {
    name: 'Wallet',
    items: (
      <>
        <MenuItem>Open Wallet page</MenuItem>
        <MenuSeparator />
        <MenuLabel>Range</MenuLabel>
        <MenuRadioGroup value="30">
          <MenuRadioItem value="7">7 days</MenuRadioItem>
          <MenuRadioItem value="30">30 days</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuCheckboxItem checked>Show on phone</MenuCheckboxItem>
      </>
    ),
    children: (
      <section className="w-72 rounded-xs border border-line bg-panel">
        <div className="flex items-center border-b border-line px-2.5 py-1 text-xs font-semibold uppercase">
          Wallet
          <span className="flex-1" />
          <RowMoreActions label="Settings for Wallet" />
        </div>
        <p className="p-3 text-text-dim">Right-click or touch and hold anywhere on the card.</p>
      </section>
    ),
  },
};
