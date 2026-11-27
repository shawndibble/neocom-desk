import type { Meta, StoryObj } from '@storybook/react-vite';
import { Eyebrow } from './Eyebrow';

/**
 * @summary A small uppercase label that names a section, field or table group. Static text:
 * it carries no action, so it has no cue (§6c).
 */
const meta = {
  title: 'ui/Eyebrow',
  component: Eyebrow,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Eyebrow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A section label above its content. */
export const Default: Story = {
  args: { children: 'Material efficiency' },
};

/** @summary `as` swaps the element, here a `legend`-style heading; `className` adds spacing only. */
export const AsHeading: Story = {
  args: { as: 'h3', className: 'mb-1.5', children: 'Active jobs' },
};
