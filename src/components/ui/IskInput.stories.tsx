import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IskInput } from './IskInput';

/**
 * @summary ISK amount field. Digits group with the display separator as they are typed; shorthand (`1.5b`, `250m`) is accepted and settles to the full figure on blur (§6c "Numbers": the full ISK form is shown, never only the shorthand).
 */
const meta = {
  title: 'ui/IskInput',
  component: IskInput,
  tags: ['autodocs'],
  args: { 'aria-label': 'Budget', value: '', onChange: () => {} },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <IskInput {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof IskInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Empty field. */
export const Empty: Story = {};

/** @summary Shorthand set from outside: shown as the grouped full figure. */
export const Shorthand: Story = { args: { value: '1500000000' } };

/** @summary `defaultAmount` shows the app's assumed figure as a masked placeholder. */
export const DefaultAmount: Story = { args: { defaultAmount: 5_000_000 } };

/** @summary Unparseable text: after a short pause the field goes invalid and a `FieldError` names the problem (§6c States). */
export const Unparseable: Story = { args: { value: 'lots' } };

/** @summary Disabled (§6c States): `opacity-40` and `cursor-not-allowed`. */
export const Disabled: Story = { args: { value: '250m', disabled: true } };
