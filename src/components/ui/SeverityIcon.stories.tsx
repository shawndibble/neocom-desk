import type { Meta, StoryObj } from '@storybook/react-vite';
import { SeverityIcon } from './SeverityIcon';

const meta = {
  title: 'ui/SeverityIcon',
  component: SeverityIcon,
  tags: ['autodocs'],
  args: { severity: 'critical' },
} satisfies Meta<typeof SeverityIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Critical: Story = {};

export const Warning: Story = { args: { severity: 'warning' } };

export const Watch: Story = { args: { severity: 'watch' } };

export const Clear: Story = { args: { severity: 'clear' } };

export const Labelled: Story = { args: { label: 'Critical' } };
