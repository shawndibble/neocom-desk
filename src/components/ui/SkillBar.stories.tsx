import type { Meta, StoryObj } from '@storybook/react-vite';
import { SkillBar } from './SkillBar';

const meta = {
  title: 'ui/SkillBar',
  component: SkillBar,
  tags: ['autodocs'],
  args: { level: 3 },
} satisfies Meta<typeof SkillBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Trained: Story = {};

export const Untrained: Story = { args: { level: 0 } };

export const InProgress: Story = { args: { level: 2, progress: 0.6 } };

export const Planned: Story = { args: { level: 2, plannedLevel: 4 } };

export const Needed: Story = { args: { level: 1, plannedLevel: 2, requiredLevel: 4 } };

export const Maxed: Story = { args: { level: 5 } };
