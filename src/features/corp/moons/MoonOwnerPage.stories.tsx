import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MoonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import { MoonOwnerPage } from './MoonOwnerPage';

const CHARACTERS: Record<number, string> = {
  1: 'Varro Kestane',
  2: 'Tamsin Holloway',
  3: 'Odile Marchetti',
  4: 'Juno Rask',
};
const REFINERIES: Record<number, string> = { 10: 'Efa - Ashfall Tatara', 11: 'Ashfall Athanor II' };

const detail: MoonOwnerDetail = {
  row: {
    id: '98',
    corporationId: 98,
    status: 'active',
    refineryCount: 2,
    mined: 412_806_000,
    since: '2026-10-01',
    theirRatePct: 8,
    minerRatePct: 12,
    owed: 13_024_480,
    balance: { kind: 'owed', isk: 13_024_480 },
    mode: 'normal',
    lastReadWellAt: '2026-10-20T06:00:00Z',
  },
  joinedAt: Date.UTC(2026, 8, 28, 10),
  offeredOwnerRatePct: 8,
  requestedRatePct: 6,
  history: [
    { kind: 'agreed', pct: 8, effectiveFrom: '2026-10-01', recordedAt: '2026-10-01T12:00:00Z' },
    { kind: 'requested', pct: 6, effectiveFrom: '2026-10-01', recordedAt: '2026-10-01T09:00:00Z' },
  ],
  payouts: [
    {
      id: 'b',
      date: '2026-10-16',
      amount: 12_000_000,
      method: 'donation',
      status: 'matched',
      notAPayout: false,
    },
    {
      id: 'a',
      date: '2026-10-04',
      amount: 8_000_000,
      method: 'donation',
      status: 'matched',
      notAPayout: false,
    },
  ],
  hasPayee: true,
  accrued: 33_024_480,
  paid: 20_000_000,
  payee: { kind: 'corporation', id: 98 },
  period: { from: '2026-10-17', to: '2026-10-19' },
  mined: [
    { characterId: 3, structureId: 11, oreTypeIds: [1, 2], quantity: 801_150, value: 152_430_000 },
    { characterId: 1, structureId: 10, oreTypeIds: [1, 2], quantity: 412_300, value: 81_204_000 },
    { characterId: 2, structureId: 10, oreTypeIds: [3], quantity: 290_800, value: 58_960_000 },
    { characterId: 4, structureId: 11, oreTypeIds: [3], quantity: 118_400, value: 45_800_000 },
  ],
};

const ORES: Record<number, string> = { 1: 'Zeolites', 2: 'Sylvite', 3: 'Bitumens' };

/** @summary One moon owner's page: their rate beside the miner rate and margin, rate history, payments, ore mined at their refineries. */
const meta = {
  title: 'corp/MoonOwnerPage',
  component: MoonOwnerPage,
  parameters: { layout: 'padded' },
  args: {
    detail,
    name: 'Ashfall Mining Collective',
    characterName: (id: number) => CHARACTERS[id] ?? `#${id}`,
    refineryName: (id: number) => REFINERIES[id] ?? `Refinery ${id}`,
    oreName: (id: number) => ORES[id] ?? `#${id}`,
    backTo: '/corp/moons/moon-owners',
    onSetRate: () => {},
    onSettledOtherwise: () => {},
    onPay: () => {},
    onAddPayment: () => {},
    onMarkPayout: () => {},
  },
} satisfies Meta<typeof MoonOwnerPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Active, with a rate they asked for that the book overrode. */
export const Active: Story = {};

/** @summary Their ledger cannot be read: the warning names the date. */
export const CantReadLedger: Story = {
  args: {
    detail: {
      ...detail,
      row: { ...detail.row, status: 'cant-read', staleSince: Date.UTC(2026, 9, 11, 9, 12) },
    },
  },
};

/** @summary Compensated another way: nothing owed, the note shows. */
export const SettledOtherwise: Story = {
  args: {
    detail: {
      ...detail,
      note: 'Fuel for their refineries and free rock access',
      row: { ...detail.row, status: 'settled-otherwise', mode: 'settled-otherwise', owed: 0 },
    },
  },
};

/** @summary No rate set yet: nothing is due until one is. */
export const NoRateSet: Story = {
  args: {
    detail: {
      ...detail,
      requestedRatePct: undefined,
      history: [],
      payouts: [],
      accrued: 0,
      paid: 0,
      row: { ...detail.row, status: 'no-rate', theirRatePct: undefined, owed: 0 },
    },
  },
};

const removalRow = { ...detail.row, status: 'removal-pending' } as const;

/** @summary A removal whose notice went out: the strip says when it takes effect, with Cancel removal. */
export const RemovalPending: Story = {
  args: {
    detail: {
      ...detail,
      row: removalRow,
      removal: {
        startedAt: Date.UTC(2026, 9, 17, 14, 22),
        startedByName: 'Kestrel Vane',
        effectiveAt: Date.UTC(2026, 9, 18, 14, 22),
      },
    },
    onRemove: () => {},
    onCancelRemoval: async () => {},
    onNoticeSent: async () => {},
  },
};

/** @summary A removal whose notice has not gone out: the 24 hours have not begun. */
export const RemovalPendingNoticeUnsent: Story = {
  args: {
    detail: {
      ...detail,
      row: removalRow,
      removal: { startedAt: Date.UTC(2026, 9, 17, 14, 22), startedByName: 'Kestrel Vane' },
    },
    onRemove: () => {},
    onCancelRemoval: async () => {},
    onNoticeSent: async () => {},
  },
};

/** @summary An officer who may edit sees Remove from this book… beside Settled otherwise…. */
export const WithRemoveButton: Story = { args: { onRemove: () => {} } };

/** @summary A detected payment an officer marked "not a payout": it stays listed and can be counted again. */
export const NotAPayout: Story = {
  args: {
    detail: {
      ...detail,
      payouts: [
        ...detail.payouts,
        {
          id: 'j1_9',
          date: '2026-10-12',
          amount: 3_000_000,
          method: 'donation',
          status: 'matched',
          journalRef: 9,
          notAPayout: true,
        },
      ],
    },
  },
};

/** @summary A viewer who may not edit: no Pay, Set rate, Settled otherwise or payment actions. */
export const ReadOnly: Story = {
  args: {
    onSetRate: undefined,
    onSettledOtherwise: undefined,
    onPay: undefined,
    onAddPayment: undefined,
    onMarkPayout: undefined,
  },
};
