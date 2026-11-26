import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatChange, StatChangeList } from './StatChange';

const meta = {
  title: 'ui/StatChange',
  component: StatChange,
  tags: ['autodocs'],
  args: { change: { key: 'totalDps', before: 400, after: 525 } },
} satisfies Meta<typeof StatChange>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Better: Story = {};

export const Worse: Story = {
  args: { change: { key: 'capacitorRechargeTime', before: 300, after: 328 } },
};

export const Neutral: Story = { args: { change: { key: 'cpuTotal', before: 100, after: 150 } } };

export const CapacitorStableToUnstable: Story = {
  args: { change: { key: 'capacitor', before: 60, after: -90 } },
};

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
