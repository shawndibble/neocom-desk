import type { Meta, StoryObj } from '@storybook/react-vite';
import { SlideOver } from './SlideOver';

const meta = {
  title: 'ui/SlideOver',
  component: SlideOver,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    title: 'Add module',
    onClose: () => {},
    children: <p className="p-4 text-sm text-text-dim">Pick a module for the selected slot.</p>,
  },
} satisfies Meta<typeof SlideOver>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Right: Story = { args: { side: 'right' } };

export const Left: Story = { args: { side: 'left' } };

export const Wide: Story = { args: { wide: true, title: 'Cargo' } };
