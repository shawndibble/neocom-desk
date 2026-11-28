import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { HeaderMoreMenu } from './HeaderMoreMenu';
import { DropdownMenuItem } from './DropdownMenu';

const meta = {
  title: 'ui/HeaderMoreMenu',
  component: HeaderMoreMenu,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="flex h-56 w-72 justify-end">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HeaderMoreMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Header tier 3 (§6c): the closed ⋮, at the `IconButton` default size it shares the header row with. */
export const Closed: Story = {
  args: {
    children: (
      <>
        <DropdownMenuItem>Ore tags…</DropdownMenuItem>
        <DropdownMenuItem>Page settings…</DropdownMenuItem>
      </>
    ),
  },
};

/** @summary The open menu: two or more real actions as text items (§6c restraint). */
export const Open: Story = {
  args: Closed.args,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'More actions' }));
  },
};
