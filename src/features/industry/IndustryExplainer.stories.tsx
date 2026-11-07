import type { Meta, StoryObj } from '@storybook/react-vite';
import { IndustryExplainer, IndustryExplainerTrigger } from './IndustryExplainer';

/** @summary "New to Industry?": the short manufacturing explainer drawer on every Industry tab. */
const meta = {
  title: 'industry/IndustryExplainer',
  component: IndustryExplainer,
  args: { open: true, onClose: () => undefined },
} satisfies Meta<typeof IndustryExplainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The drawer open: the chain, the two kinds of blueprint, the Alpha caps and this page's tools. */
export const Open: Story = {};

/** @summary The header button that opens it, labelled at every width (try the phone viewport). */
export const Trigger: Story = {
  render: () => <IndustryExplainerTrigger />,
};
