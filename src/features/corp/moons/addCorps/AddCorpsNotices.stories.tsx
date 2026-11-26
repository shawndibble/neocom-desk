import type { Meta, StoryObj } from '@storybook/react-vite';
import { NewCorpBanner, ResumeNotice } from './AddCorpsNotices';

const meta = {
  title: 'corp/AddCorpsNotices',
  component: NewCorpBanner,
  parameters: { layout: 'padded' },
  args: {
    name: 'Ironvale Reach Two',
    ceoName: 'Kestrel Vane',
    onConnect: () => {},
    onNotNow: () => {},
    onDontAsk: () => {},
  },
} satisfies Meta<typeof NewCorpBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewCorp: Story = {};

export const Resume: Story = {
  render: () => <ResumeNotice done={5} total={12} onContinue={() => {}} />,
};
