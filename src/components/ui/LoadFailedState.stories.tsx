import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoadFailedState } from './LoadFailedState';

const meta = {
  title: 'ui/LoadFailedState',
  component: LoadFailedState,
  tags: ['autodocs'],
  args: { onRetry: () => {} },
} satisfies Meta<typeof LoadFailedState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: {} };

export const NamedSource: Story = {
  args: {
    title: "Couldn't reach the contract index",
    hint: 'Nothing is cached yet.',
  },
};
