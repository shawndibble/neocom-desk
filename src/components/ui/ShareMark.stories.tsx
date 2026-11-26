import type { Meta, StoryObj } from '@storybook/react-vite';
import { ShareMark } from './ShareMark';

const meta = {
  title: 'ui/ShareMark',
  component: ShareMark,
  tags: ['autodocs'],
  args: { label: 'Pops shared with Corp, Alliance' },
} satisfies Meta<typeof ShareMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Shared: Story = {};

export const Off: Story = { args: { off: true, label: 'Moon owner turned sharing off' } };

export const Linked: Story = {
  args: { to: '/corp/moons/extractions?settings=sharing&highlight=7' },
};
