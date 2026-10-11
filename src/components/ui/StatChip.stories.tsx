import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatChip, StatChips } from './StatChip';

/**
 * Static label and value readout, no border or fill. Cue (§6, §6c "A box sized
 * like a field"): a box means clickable, so a chip never has one.
 *
 * @summary Small read-only label and value.
 */
const meta = {
  title: 'ui/StatChip',
  component: StatChip,
  tags: ['autodocs'],
  args: { label: 'Balance', value: '1,204,500 ISK' },
} satisfies Meta<typeof StatChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Static readout (§6): label and value, nothing to press. */
export const Default: Story = {};

/** @summary Tone cue (§7): colour tints the value; the figure always carries the meaning too. */
export const Warning: Story = { args: { tone: 'warning', label: 'Free slots', value: '0' } };

/** @summary Tone cue (§7): `danger` for a value that needs attention. */
export const Danger: Story = { args: { tone: 'danger', label: 'Expired', value: '3' } };

/** @summary Explainer cue (§6c "?" circle): `tooltip` explains the label's term, never a dialog. */
export const WithTooltip: Story = {
  args: { label: 'Margin', value: '12%', tooltip: 'Profit as a share of the buy price.' },
};

/** @summary Emphasis: the one figure a group leads with. */
export const Emphasis: Story = { args: { emphasis: true, tone: 'accent' } };

/** @summary Strip: `StatChips` spaces chips with a hairline between neighbours. */
export const Strip: Story = {
  render: () => (
    <StatChips>
      <StatChip label="Balance" value="1.2B ISK" emphasis />
      <StatChip label="Skill points" value="84,200,000" />
      <StatChip label="Jobs" value="4" tone="success" />
    </StatChips>
  ),
};

/** @summary Strip: `dense` tightens the spacing for a narrow sidebar column. */
export const DenseStrip: Story = {
  render: () => (
    <div className="w-80">
      <StatChips dense>
        <StatChip label="Jobs" value="4" />
        <StatChip label="Slots" value="12" />
      </StatChips>
    </div>
  ),
};
