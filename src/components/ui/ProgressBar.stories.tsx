import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressBar } from './ProgressBar';

const meta = {
  title: 'ui/ProgressBar',
  component: ProgressBar,
  tags: ['autodocs'],
  args: { label: 'Training progress', value: 62 },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const CustomRange: Story = { args: { label: 'Units remaining', value: 25, max: 200 } };

export const Tones: Story = {
  render: () => (
    <div className="space-y-2">
      <ProgressBar label="Accent" value={60} />
      <ProgressBar label="Success" value={100} tone="success" />
      <ProgressBar label="Warning" value={92} tone="warning" />
      <ProgressBar label="Danger" value={100} tone="danger" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="space-y-2">
      <ProgressBar label="xs" value={50} size="xs" />
      <ProgressBar label="sm" value={50} size="sm" />
      <ProgressBar label="md" value={50} size="md" />
    </div>
  ),
};

export const OnRaisedSurface: Story = {
  args: { surface: 'panel-2' },
  decorators: [
    (Story) => (
      <div className="bg-panel-2 p-3">
        <Story />
      </div>
    ),
  ],
};

export const Indeterminate: Story = { args: { label: 'Searching', value: null } };

export const Bounds: Story = {
  render: () => (
    <div className="space-y-2">
      <ProgressBar label="Empty" value={0} />
      <ProgressBar label="Full" value={100} />
      <ProgressBar label="Overshoot" value={140} />
    </div>
  ),
};
