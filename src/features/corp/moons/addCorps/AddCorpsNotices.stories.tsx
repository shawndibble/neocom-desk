import type { Meta, StoryObj } from '@storybook/react-vite';
import { NewCorpBanner, ResumeNotice } from './AddCorpsNotices';

/** @summary The one-time New corp found prompt and the resume line for a half-done run. */
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

/** @summary A corp that appeared since the player last looked. */
export const NewCorp: Story = {};

/** @summary A run left at corp 5 of 12: the way back in. */
export const Resume: Story = {
  render: () => <ResumeNotice done={5} total={12} onContinue={() => {}} />,
};
