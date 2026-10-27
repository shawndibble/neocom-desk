import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './Checkbox';
import { Field, Fields } from './Fields';
import { NativeSelect } from './NativeSelect';
import { TextInput } from './TextInput';

/**
 * @summary Labelled-control grid: `Fields` sets the columns, each `Field` is one subgrid row with a label, control and optional note. A box sized like a field marks a control (§6c).
 */
const meta = {
  title: 'ui/Fields',
  component: Fields,
  tags: ['autodocs'],
  args: { variant: 'compact', children: null },
  render: (args) => (
    <Fields variant={args.variant}>
      <Field label="Name" htmlFor="fields-name">
        <TextInput id="fields-name" defaultValue="Rifter run" />
      </Field>
      <Field label="Hub" htmlFor="fields-hub" note="Prices come from this hub's sell orders.">
        <NativeSelect id="fields-hub">
          <option>Jita</option>
          <option>Amarr</option>
        </NativeSelect>
      </Field>
      <Field label="Tax" htmlFor="fields-tax" tone="warning" note="Moved off the 8% default.">
        <TextInput id="fields-tax" defaultValue="3.6" />
      </Field>
    </Fields>
  ),
} satisfies Meta<typeof Fields>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary `compact`: two columns, dim labels, for a dense panel or modal. */
export const Compact: Story = {};

/** @summary `form`: stacked on a phone, label column beside the control at `lg`, hairlines between rows. */
export const Form: Story = { args: { variant: 'form' } };

/** @summary `inline` is for a lone checkbox in a `form` grid: control sits beside its label. */
export const InlineCheckbox: Story = {
  args: { variant: 'form' },
  render: (args) => (
    <Fields variant={args.variant}>
      <Field label="Hide bait sells" htmlFor="fields-bait" inline note="Drops likely scam orders.">
        <Checkbox id="fields-bait" />
      </Field>
    </Fields>
  ),
};
