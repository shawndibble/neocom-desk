import type { Meta, StoryObj } from '@storybook/react-vite';
import { IskDelta } from './IskDelta';

/**
 * A signed ISK change: the sign is printed and the isk-pos / isk-neg tone
 * repeats it, so colour never carries the sign alone.
 *
 * @summary A signed ISK change with its "+" and the isk-pos / isk-neg tone.
 */
const meta = {
  title: 'ui/IskDelta',
  component: IskDelta,
  tags: ['autodocs'],
  args: { amount: 1250000 },
} satisfies Meta<typeof IskDelta>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Gain: a "+" and the isk-pos tone. */
export const Gain: Story = {};

/** @summary Loss: the minus and the isk-neg tone. */
export const Loss: Story = { args: { amount: -340000 } };

/** @summary Zero: plain, no sign and no tone. */
export const Zero: Story = { args: { amount: 0 } };

/** @summary Whole ISK: `decimals={0}` for surfaces that never show fractions. */
export const WholeIsk: Story = { args: { amount: 987654.4, decimals: 0 } };
