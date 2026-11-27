import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Slider } from './Slider';

/**
 * @summary Native range slider in the house recipe: accent track, shared focus ring, 36px touch tier. Always named, always with its value printed beside it.
 */
const meta = {
  title: 'ui/Slider',
  component: Slider,
  tags: ['autodocs'],
  args: { 'aria-label': 'Optimal range', min: 0, max: 100, step: 1 },
  render: function Render(args) {
    const [value, setValue] = useState(63);
    const text = `${(9.5 + value / 50).toFixed(2)} km`;
    return (
      <div className="flex w-72 items-center gap-2 text-xs">
        <Slider
          {...args}
          value={value}
          valueText={text}
          onChange={(event) => setValue(Number(event.target.value))}
        />
        <span className="w-16 shrink-0 text-right tabular-nums">{text}</span>
      </div>
    );
  },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A roll slider: worst at the left, best at the right, the absolute value printed beside it and passed as `valueText`. */
export const Default: Story = {};

/** @summary Fine steps on a narrow range: `step` set so one arrow-key press moves a visible amount. */
export const FineStep: Story = { args: { min: 0, max: 1000, step: 1 } };

/** @summary Disabled (§6c States): `opacity-40` and `cursor-not-allowed`. */
export const Disabled: Story = { args: { disabled: true } };

/** @summary Anti-pattern: a slider with no name and no printed value; the position alone says nothing. */
export const NoLabel: Story = {
  tags: ['!manifest'],
  render: (args) => <Slider {...args} aria-label={undefined} />,
};
