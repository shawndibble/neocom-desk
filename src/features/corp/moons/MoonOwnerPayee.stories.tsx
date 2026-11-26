import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChangePayeeDialog, PayeeChangeStrip, PayeeLine } from './MoonOwnerPayee';

const meta = {
  title: 'corp/MoonOwnerPayee',
  component: PayeeLine,
  parameters: { layout: 'padded' },
  args: { name: 'Ashfall Mining Collective', onChange: () => {} },
} satisfies Meta<typeof PayeeLine>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = {};

export const SetByAccounting: Story = {
  args: { setBy: { name: 'Brass Meridian Logistics', at: Date.UTC(2026, 9, 21) } },
};

export const SetByYou: Story = { args: { setBy: { name: null, at: Date.UTC(2026, 9, 21) } } };

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

export const ReadOnly: Story = { args: { onChange: undefined } };

export const Dialog: Story = {
  render: () => <ChangePayeeDialog characterId={1} onClose={() => {}} onSave={async () => {}} />,
};
