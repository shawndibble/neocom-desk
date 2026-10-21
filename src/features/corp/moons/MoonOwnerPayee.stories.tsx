import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChangePayeeDialog, PayeeChangeStrip, PayeeLine } from './MoonOwnerPayee';

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

/** @summary Set by the accounting corporation (#4653): who set it and when, after the name. */
export const SetByAccounting: Story = {
  args: { setBy: { name: 'Brass Meridian Logistics', at: Date.UTC(2026, 9, 21) } },
};

/** @summary Set by this side: "Set by you on …". */
export const SetByYou: Story = { args: { setBy: { name: null, at: Date.UTC(2026, 9, 21) } } };

/** @summary The strip either page shows when the other side changed the payee, until dismissed. */
export const ChangeNotice: Story = {
  render: () => (
    <PayeeChangeStrip
      storageKey="story-notice"
      at={Date.UTC(2026, 9, 21)}
      payeeName="Kestrel Vane"
      byName="Brass Meridian Logistics"
    />
  ),
};

/** @summary A viewer who may not edit: the line without Change…. */
export const ReadOnly: Story = { args: { onChange: undefined } };

/** @summary The Change… dialog: pick a corporation or a player from the name search. */
export const Dialog: Story = {
  render: () => <ChangePayeeDialog characterId={1} onClose={() => {}} onSave={async () => {}} />,
};
