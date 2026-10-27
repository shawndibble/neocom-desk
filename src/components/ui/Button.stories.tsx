import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const meta = {
  title: 'ui/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Save plan' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The one main action of a view. */
export const Primary: Story = { args: { variant: 'primary' } };

/** @summary The quiet default for secondary actions. */
export const Ghost: Story = { args: { variant: 'ghost' } };

/** @summary A destructive action. */
export const Danger: Story = { args: { variant: 'danger', children: 'Delete plan' } };

/** @summary An action is running: the label keeps its width and a spinner shows. */
export const Loading: Story = { args: { variant: 'primary', loading: true } };
