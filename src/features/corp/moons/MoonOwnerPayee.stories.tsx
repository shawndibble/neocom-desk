import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChangePayeeDialog, PayeeLine } from './MoonOwnerPayee';

/** @summary "Who gets paid" on the moon owner's page, with Change… for its officers. */
const meta = {
  title: 'corp/MoonOwnerPayee',
  component: PayeeLine,
  parameters: { layout: 'padded' },
  args: { name: 'Ashfall Mining Collective', onChange: () => {} },
} satisfies Meta<typeof PayeeLine>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary None set: the moon owner corporation itself, with Change…. */
export const Line: Story = {};

/** @summary A viewer who may not edit: the line without Change…. */
export const ReadOnly: Story = { args: { onChange: undefined } };

/** @summary The Change… dialog: pick a corporation or a player from the name search. */
export const Dialog: Story = {
  render: () => <ChangePayeeDialog characterId={1} onClose={() => {}} onSave={async () => {}} />,
};
