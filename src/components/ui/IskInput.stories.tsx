import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IskInput } from './IskInput';

/**
 * @summary ISK amount field. Accepts shorthand (`1.5b`, `250m`) and echoes the full figure beneath; §6c "Numbers": the full ISK form is shown, never only the shorthand.
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

/** @summary Shorthand typed: the full ISK figure echoes beneath so the pilot can check the zeros. */
export const WithEcho: Story = { args: { value: '1.5b' } };

/** @summary `defaultAmount` shows the app's assumed figure as a masked placeholder. */
export const DefaultAmount: Story = { args: { defaultAmount: 5_000_000 } };

/** @summary Unparseable text: after a short pause the field goes invalid and a `FieldError` names the problem (§6c States). */
export const Unparseable: Story = { args: { value: 'lots' } };

/** @summary `echo` off, for a field whose neighbouring figure already shows the result. */
export const NoEcho: Story = { args: { value: '250m', echo: false } };

/** @summary `mask`: digits group with the display separator as they are typed, so there is no echo; shorthand (`100k`) stays as typed. */
export const Masked: Story = { args: { value: '50000000', mask: true } };

/** @summary Disabled (§6c States): `opacity-40` and `cursor-not-allowed`. */
export const Disabled: Story = { args: { value: '250m', disabled: true } };
