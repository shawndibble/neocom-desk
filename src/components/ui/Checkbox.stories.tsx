import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './Checkbox';

/**
 * @summary Native checkbox with the accent colour: an independent on/off choice. Always pair with a visible `<label>`.
 */
const meta = {
  title: 'ui/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  render: (args) => (
    <label className="inline-flex items-center gap-2 text-sm">
      <Checkbox {...args} />
      Hide bait sells
    </label>
  ),
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Off. Selected state is the check glyph, not colour alone (§6c States, Selected). */
export const Unchecked: Story = {};

/** @summary On. */
export const Checked: Story = { args: { defaultChecked: true } };

/** @summary Disabled (§6c States): `opacity-40` and `cursor-not-allowed`. */
export const Disabled: Story = { args: { disabled: true, defaultChecked: true } };

/** @summary Anti-pattern: a checkbox with no label or `aria-label` is unnamed to a screen reader and a tiny tap target. */
export const NoLabel: Story = {
  tags: ['!manifest'],
  render: (args) => <Checkbox {...args} />,
};
