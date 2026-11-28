import type { Meta, StoryObj } from '@storybook/react-vite';
import { SlideOver } from './SlideOver';

/**
 * @summary Non-modal panel over one edge (docs/adr/0008).
 */
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

/** @summary Right edge, the default. */
export const Right: Story = { args: { side: 'right' } };

/** @summary Left edge. */
export const Left: Story = { args: { side: 'left' } };

/** @summary `wide`: a panel holding a table, up to 64rem wide. */
export const Wide: Story = { args: { wide: true, title: 'Cargo' } };
