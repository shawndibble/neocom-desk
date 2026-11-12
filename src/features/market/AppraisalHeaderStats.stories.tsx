import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AppraisalNetTotals, AppraisalTotals } from '@/engine/market/appraisal';
import { AppraisalHeaderStats } from './AppraisalHeaderStats';

const totals = (over: Partial<AppraisalTotals> = {}): AppraisalTotals => ({
  buy: 2_741_300_000,
  sell: 2_800_260_000,
  spread: 58_960_000,
  unpricedRows: 0,
  refine: 0,
  refineSell: 0,
  refineUnpricedRows: 0,
  cheapestBuy: 2_800_260_000,
  cheapestBuyViaLp: 0,
  volume: 12_500,
  volumeUnknownRows: 0,
  ...over,
});

const NET: AppraisalNetTotals = {
  instantNet: 2_535_702_500,
  listNet: 2_506_232_700,
  salesTaxPct: 7.5,
  brokerFeePct: 3,
};

/** @summary The Appraisal's Buy, Split and Sell cards: every figure in full, one copy area above each divider and one below. */
const meta = {
  title: 'market/AppraisalHeaderStats',
  component: AppraisalHeaderStats,
  parameters: { layout: 'fullscreen' },
  args: {
    totals: totals(),
    net: NET,
    itemCount: 42,
    showRefine: false,
    refineValue: 0,
    refineBasis: 'buy',
    showCheapest: false,
    implantBonusPct: 0,
  },
  decorators: [
    (Story) => (
      <div className="p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppraisalHeaderStats>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A ten-digit pile with the Character's fees known: two copy areas a card. */
export const Default: Story = {};

/** @summary The widest case: 13-digit totals and a negative spread. Three across with the total sized to the width; one card per row on a phone. */
export const ThirteenDigits: Story = {
  args: {
    totals: totals({
      buy: 6_912_345_678_901,
      sell: 6_721_406_250_000,
      spread: -190_939_428_901,
      cheapestBuy: 6_721_406_250_000,
    }),
    net: { ...NET, instantNet: 6_393_919_752_983, listNet: 6_015_658_593_750 },
  },
};

/** @summary Skills still loading: Buy and Sell have no second figure, so only the top area copies. */
export const NoNetFigures: Story = {
  args: { net: null },
};
