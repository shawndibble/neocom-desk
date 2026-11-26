import type { Meta, StoryObj } from '@storybook/react-vite';
import { Eyebrow } from './Eyebrow';

const meta = {
  title: 'ui/Eyebrow',
  component: Eyebrow,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Eyebrow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'Material efficiency' },
};

export const AsHeading: Story = {
  args: { as: 'h3', className: 'mb-1.5', children: 'Active jobs' },
};
