import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImproveMakeover } from './ImproveMakeover';
import {
  BEFORE,
  MAKEOVER,
  MAKEOVER_KEYS,
  rowCostOf,
  SINGLE_GAINS,
  typeNameOf,
} from './improveMakeoverFixture';

/**
 * @summary The Improve Makeover group: rows by the fitted module that leaves, a three-state
 * group tick, and the whole-fit before → after figures.
 */
const meta = {
  title: 'fittings/ImproveMakeover',
  component: ImproveMakeover,
  tags: ['autodocs'],
  args: {
    makeover: MAKEOVER,
    before: BEFORE,
    ticked: new Set(MAKEOVER_KEYS),
    onToggle: () => {},
    singleGains: SINGLE_GAINS,
    rounds: 4,
    typeName: typeNameOf,
    rowCost: rowCostOf,
  },
  decorators: [
    (Story) => (
      <div className="w-[24rem] max-w-full p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImproveMakeover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Every row ticked: the group is whole and no row shows a gain of its own. */
export const AllTicked: Story = {};

/** @summary One row unticked: the group shows a dash and each row shows "On its own". */
export const PartlyTicked: Story = {
  args: { ticked: new Set(MAKEOVER_KEYS.slice(0, 1).concat(MAKEOVER_KEYS.slice(2))) },
};

function InteractiveMakeover(args: ComponentProps<typeof ImproveMakeover>) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set(MAKEOVER_KEYS));
  return (
    <ImproveMakeover
      {...args}
      ticked={ticked}
      onToggle={(keys, checked) =>
        setTicked((current) => {
          const next = new Set(current);
          for (const key of keys) {
            if (checked) next.add(key);
            else next.delete(key);
          }
          return next;
        })
      }
    />
  );
}

/** @summary Interactive: tick the group or a row. */
export const Interactive: Story = { render: (args) => <InteractiveMakeover {...args} /> };
