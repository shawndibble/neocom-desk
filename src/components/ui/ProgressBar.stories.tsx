import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressBar } from './ProgressBar';

/**
 * A thin filled track for how far along something is. Print the figure beside
 * it where one exists; the bar alone is not a readout.
 *
 * @summary A thin filled track for how far along something is.
 */
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

/** @summary Basic: a value out of 100 in the accent tone. */
export const Basic: Story = {};

/** @summary Custom range: `max` sets what full means, e.g. units left of units issued. */
export const CustomRange: Story = { args: { label: 'Units remaining', value: 25, max: 200 } };

/** @summary Tones: accent is progress; success, warning and danger carry a status. */
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

/** @summary Sizes: `xs` 4px, `sm` 6px (default), `md` 8px. */
export const Sizes: Story = {
  render: () => (
    <div className="space-y-2">
      <ProgressBar label="xs" value={50} size="xs" />
      <ProgressBar label="sm" value={50} size="sm" />
      <ProgressBar label="md" value={50} size="md" />
    </div>
  ),
};

/** @summary Surface: on a raised `panel-2` row (an expanded table detail) the track steps up to `line` so it stays visible. */
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

/** @summary Indeterminate: `value={null}` while work runs and the total is unknown; it pulses unless motion is reduced. */
export const Indeterminate: Story = { args: { label: 'Searching', value: null } };

/** @summary Full and empty: both ends render cleanly, and an overshoot is clamped. */
export const Bounds: Story = {
  render: () => (
    <div className="space-y-2">
      <ProgressBar label="Empty" value={0} />
      <ProgressBar label="Full" value={100} />
      <ProgressBar label="Overshoot" value={140} />
    </div>
  ),
};
