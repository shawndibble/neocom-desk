import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatChange, StatChangeList } from './StatChange';

/**
 * One fit stat changing, `before → after`: the arrow and the after value are
 * green when better, red when worse and plain when neutral. Used by every
 * fit-change preview (Add panel readout, Improve, Make it fit).
 *
 * @summary A fit stat's before → after, green when better, red when worse.
 */
const meta = {
  title: 'ui/StatChange',
  component: StatChange,
  tags: ['autodocs'],
  args: { change: { key: 'totalDps', before: 400, after: 525 } },
} satisfies Meta<typeof StatChange>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Better: a higher DPS, in success. */
export const Better: Story = {};

/** @summary Worse: a longer capacitor recharge, in danger. */
export const Worse: Story = {
  args: { change: { key: 'capacitorRechargeTime', before: 300, after: 328 } },
};

/** @summary Neutral: a total that only moves with the hull, in plain text. */
export const Neutral: Story = { args: { change: { key: 'cpuTotal', before: 100, after: 150 } } };

/** @summary Capacitor going from stable to unstable: worse. */
export const CapacitorStableToUnstable: Story = {
  args: { change: { key: 'capacitor', before: 60, after: -90 } },
};

/** @summary Several changes as a list: the stat in one column, before → after and unit in the next (Improve's rows). */
export const List: Story = {
  render: () => (
    <div className="w-72 text-xs">
      <StatChangeList
        changes={[
          { key: 'capacitor', before: -30, after: -36 },
          { key: 'maxVelocity', before: 2894, after: 2928 },
          { key: 'capacitorCapacity', before: 430, after: 484 },
          { key: 'powergridUsed', before: 28, after: 30 },
        ]}
      />
    </div>
  ),
};
