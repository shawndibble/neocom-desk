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

const meta = {
  title: 'ui/RowActionsMenu',
  component: RowActionsMenu,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof RowActionsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

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

export const OpenInNewTab: Story = {
  args: {
    name: 'Tritanium',
    openHref: '/market/browser?type=34',
    items: (
      <>
        <MenuItem>Copy name</MenuItem>
        <MenuItem>Show info</MenuItem>
      </>
    ),
    children: (
      <div className="flex w-72 items-center rounded-xs border border-line bg-panel px-2.5 py-1">
        Tritanium
        <span className="flex-1" />
        <RowMoreActions />
      </div>
    ),
  },
};
