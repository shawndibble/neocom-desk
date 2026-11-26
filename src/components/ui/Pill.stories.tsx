import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pill } from './Pill';

const meta = {
  title: 'ui/Pill',
  component: Pill,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Pill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {
  args: { children: 'Corp' },
};

export const Accent: Story = {
  args: { tone: 'accent', children: 'In plan' },
};

export const Success: Story = {
  args: { tone: 'success', children: 'Done' },
};

export const Warning: Story = {
  args: { tone: 'warning', children: 'Completing soon' },
};

export const Danger: Story = {
  args: { tone: 'danger', children: '3 lost' },
};

export const Outlined: Story = {
  args: { outlined: true, tone: 'warning', children: 'Estimate' },
};

export const OutlinedTones: Story = {
  args: { children: 'Rebuild', outlined: true },
  render: () => (
    <div className="flex gap-2">
      <Pill outlined>Rebuild</Pill>
      <Pill outlined tone="accent">
        Add
      </Pill>
      <Pill outlined tone="success">
        Done
      </Pill>
      <Pill outlined tone="warning">
        Remove
      </Pill>
      <Pill outlined tone="danger">
        Lost
      </Pill>
    </div>
  ),
};
