import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChartTooltipShell } from './ChartTooltipShell';
import { PointTooltip } from './PointTooltip';

/**
 * @summary A caller-controlled bubble over a moving point, for chart hover readouts (`Tooltip` is
 * for a focusable trigger). Fill it with `ChartTooltipShell`; pointer-only, so the figures must
 * also live in a table or summary.
 */
const meta = {
  title: 'ui/PointTooltip',
  component: PointTooltip,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="relative h-32 w-64 border-b border-line-bright">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PointTooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Open over a point 70% along the plot. */
export const Open: Story = {
  args: {
    open: true,
    onClose: () => {},
    anchor: <span className="absolute top-0 h-full w-0" style={{ left: '70%' }} />,
    children: (
      <ChartTooltipShell>
        <b className="mb-1 block font-semibold text-text">1 week ago</b>
        <div className="flex justify-between gap-4">
          <span>Net</span>
          <span className="text-isk-pos">+200M</span>
        </div>
      </ChartTooltipShell>
    ),
  },
};
