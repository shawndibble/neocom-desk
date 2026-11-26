import type { Meta, StoryObj } from '@storybook/react-vite';
import { IndustryExplainer, IndustryExplainerTrigger } from './IndustryExplainer';

const meta = {
  title: 'industry/IndustryExplainer',
  component: IndustryExplainer,
  args: { open: true, onClose: () => undefined },
} satisfies Meta<typeof IndustryExplainer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Trigger: Story = {
  render: () => <IndustryExplainerTrigger />,
};
