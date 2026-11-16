import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel } from '@/components/ui';
import type { SpendPlanResult, SpendPlanRow, SpendStop } from '@/engine/loyalty/spendPlan';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import { SpendLpButton, SpendPlanPanel } from '@/features/loyalty/SpendPlan';
import type { SpendPlanView } from '@/features/loyalty/useSpendPlan';
import type { AsyncLoad } from '@/lib/useAsyncLoad';
import { NewComponent } from './NewComponent';

/**
 * LP Store "Spend my LP" (issue #6199): the button in the offers list's header
 * and the plan it opens above the offers, in each state the ticket asks for.
 * Sample data, built from the real components.
 *
 * New components in this mockup: `SpendLpButton`, `SpendPlanPanel`.
 */

const names: Record<number, string> = {
  1: 'Caldari Navy Hookbill',
  2: 'Caldari Navy Mjolnir Heavy Missile',
  3: 'Caldari Navy Ballistic Control System',
  4: 'Caldari Navy Raven Blueprint',
};
const rowsById = new Map(
  Object.entries(names).map(([id, itemName]) => [
    Number(id),
    {
      itemName,
      offer: { offer_id: Number(id) },
      requiredItems: [
        { typeId: 17_000, name: 'Caldari Navy Admiral Insignia I', quantity: 1, unitPrice: null },
        {
          typeId: 17_001,
          name: 'Caldari Navy Vice Admiral Insignia I',
          quantity: 2,
          unitPrice: null,
        },
      ],
    } as unknown as LoyaltyOfferRow,
  ])
);

function row(over: Partial<SpendPlanRow> & { offerId: number }): SpendPlanRow {
  return {
    redemptions: 1,
    lpSpent: 0,
    iskCost: 0,
    turnInsCost: 0,
    turnIns: [],
    revenue: 0,
    salesTax: 0,
    income: 0,
    profit: 0,
    ...over,
  };
}

function view(rows: SpendPlanRow[], stop: SpendStop, walletBalance: number | null): SpendPlanView {
  const sum = (pick: (r: SpendPlanRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const lpSpent = sum((r) => r.lpSpent);
  const profit = sum((r) => r.profit);
  const result: SpendPlanResult = {
    rows,
    totals: {
      lpSpent,
      iskCost: sum((r) => r.iskCost),
      turnInsCost: sum((r) => r.turnInsCost),
      purchases: sum((r) => r.iskCost + r.turnInsCost),
      revenue: sum((r) => r.revenue),
      salesTax: sum((r) => r.salesTax),
      income: sum((r) => r.income),
      profit,
    },
    lpLeft: 400_000 - lpSpent,
    iskPerLp: lpSpent > 0 ? profit / lpSpent : null,
    stop,
    unpriced: [],
  };
  return { result, rowsById, walletBalance, candidates: 10 };
}

const planRows = [
  row({
    offerId: 3,
    redemptions: 8,
    lpSpent: 200_000,
    iskCost: 160_000_000,
    turnInsCost: 12_400_000,
    turnIns: [{ typeId: 17_000, owned: 3, bought: 5 }],
    revenue: 600_000_000,
    salesTax: 27_000_000,
    income: 573_000_000,
    profit: 400_600_000,
  }),
  row({
    offerId: 2,
    redemptions: 12,
    lpSpent: 120_000,
    iskCost: 36_000_000,
    revenue: 260_000_000,
    salesTax: 11_700_000,
    income: 248_300_000,
    profit: 212_300_000,
  }),
  row({
    offerId: 4,
    redemptions: 1,
    lpSpent: 60_000,
    iskCost: 95_000_000,
    turnInsCost: 4_000_000,
    turnIns: [{ typeId: 17_001, owned: 0, bought: 2 }],
    revenue: 220_000_000,
    salesTax: 9_900_000,
    income: 210_100_000,
    profit: 111_100_000,
  }),
];

const ready = (data: SpendPlanView): AsyncLoad<SpendPlanView> => ({
  status: 'ready',
  data,
  retry: () => {},
});

function Frame({
  plan,
  playerLp = 400_000,
}: {
  plan: AsyncLoad<SpendPlanView>;
  playerLp?: number;
}) {
  return (
    <div className="mx-auto flex max-w-page flex-col gap-3 p-4">
      <NewComponent name="SpendPlanPanel">
        <SpendPlanPanel
          plan={plan}
          playerLp={playerLp}
          onSelectOffer={() => {}}
          onClose={() => {}}
        />
      </NewComponent>
      <Panel
        title="LP Store"
        meta="24 / 31 offers · Jita · Sell now"
        padded={false}
        actions={
          <NewComponent name="SpendLpButton">
            <SpendLpButton playerLp={playerLp} rankable loading={false} onClick={() => {}} />
          </NewComponent>
        }
      >
        <p className="p-4 text-xs text-text-dim">The offers table, unchanged.</p>
      </Panel>
    </div>
  );
}

const meta = {
  title: 'mockups/LpStoreSpendPlan',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Populated plan that stopped at the pilot's typed LP Value, naming the offer. */
export const StoppedAtLpValue: Story = {
  render: () => (
    <Frame
      plan={ready(
        view(
          planRows,
          {
            reason: 'belowFloor',
            offerId: 1,
            iskPerLp: 1_420,
            floor: { rate: 1_650, source: 'yours' },
          },
          1_284_390_551
        )
      )}
    />
  ),
};

/** @summary The next redemption needed more ISK than the wallet holds. */
export const StoppedAtWallet: Story = {
  render: () => (
    <Frame
      plan={ready(
        view(
          planRows.slice(0, 2),
          { reason: 'wallet', offerId: 4, iskPerLp: 1_850, floor: null },
          210_000_000
        )
      )}
    />
  ),
};

/** @summary Under 70% of the best (no LP Value, no market rate), wallet unknown. */
export const StoppedAtBestShare: Story = {
  render: () => (
    <Frame
      plan={ready(
        view(
          planRows,
          {
            reason: 'belowFloor',
            offerId: 1,
            iskPerLp: 1_310,
            floor: { rate: 0.7 * 2_003, source: 'best', best: 2_003 },
          },
          null
        )
      )}
    />
  ),
};

/** @summary Nothing in the store earns ISK on instant sell. */
export const NothingProfitable: Story = {
  render: () => (
    <Frame
      plan={ready(
        view([], { reason: 'nothingProfitable', offerId: 1, iskPerLp: -40, floor: null }, null)
      )}
    />
  ),
};

/** @summary Reading the order books after the press. */
export const Loading: Story = {
  render: () => <Frame plan={{ status: 'loading', data: undefined, retry: () => {} }} />,
};

/** @summary 0 LP: the button is aria-disabled with its reason in a tooltip; no plan opens. */
export const ZeroLpDisabled: Story = {
  render: () => (
    <div className="mx-auto max-w-page p-4">
      <Panel
        title="LP Store"
        meta="31 offers · Jita · Sell now"
        padded={false}
        actions={<SpendLpButton playerLp={0} rankable loading={false} onClick={() => {}} />}
      >
        <p className="p-4 text-xs text-text-dim">The offers table, unchanged.</p>
      </Panel>
    </div>
  ),
};

/** @summary The populated plan in the phone shell. */
export const StoppedAtLpValuePhone: Story = {
  ...StoppedAtLpValue,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
