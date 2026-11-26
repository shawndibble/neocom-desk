import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeftCorpNotice, LeftCorpNotices } from './LeftCorpNotice';

const noop = () => {};
const ashfall = {
  corporationId: 98000002,
  corpName: 'Ashfall Mining Co.',
  owed: 4_820_000,
  characterIds: [1],
};

const meta = {
  title: 'Mining Tax/LeftCorpNotice',
  component: LeftCorpNotice,
  args: { book: ashfall, onPay: noop, onStopShowing: noop },
} satisfies Meta<typeof LeftCorpNotice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Owing: Story = {};

export const NothingOwed: Story = { args: { book: { ...ashfall, owed: 0 } } };

export const WithHiddenLine: Story = {
  render: () => (
    <LeftCorpNotices
      books={[ashfall]}
      hidden={[{ corporationId: 98000003, corpName: 'Brass Meridian Logistics' }]}
      onPay={noop}
      onStopShowing={noop}
      onShow={noop}
    />
  ),
};
