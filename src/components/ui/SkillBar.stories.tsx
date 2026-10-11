import type { Meta, StoryObj } from '@storybook/react-vite';
import { SkillBar } from './SkillBar';

/**
 * Five-segment level readout. Status cue (§7): filled accent is trained, a
 * hairline is untrained; the accessible name states the level in words.
 *
 * @summary Skill level out of five.
 */
const meta = {
  title: 'ui/SkillBar',
  component: SkillBar,
  tags: ['autodocs'],
  args: { level: 3 },
} satisfies Meta<typeof SkillBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Trained levels filled, the rest hairline. */
export const Trained: Story = {};

/** @summary Untrained: all hairline. */
export const Untrained: Story = { args: { level: 0 } };

/** @summary Progress: the next segment is partly filled with banked training. */
export const InProgress: Story = { args: { level: 2, progress: 0.6 } };

/** @summary Plan cue: segments up to `plannedLevel` get a distinct outline. */
export const Planned: Story = { args: { level: 2, plannedLevel: 4 } };

/** @summary Maxed: all five filled. */
export const Maxed: Story = { args: { level: 5 } };
