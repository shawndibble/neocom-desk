import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MoonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import { MoonOwnerPage } from './MoonOwnerPage';
import { PayeeChangeStrip } from './MoonOwnerPayee';

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

const meta = {
  title: 'corp/MoonOwnerPage',
  component: MoonOwnerPage,
  parameters: { layout: 'padded' },
  args: {
    detail,
    name: 'Ashfall Mining Collective',
    accountingName: 'Brass Meridian Logistics',
    characterName: (id: number) => CHARACTERS[id] ?? `#${id}`,
    refineryName: (id: number) => REFINERIES[id] ?? `Refinery ${id}`,
    refineryEdit: {
      current: (id: number) => (id === 10 ? 'Efa - Ashfall Tatara' : ''),
      onSave: async () => {},
    },
    oreName: (id: number) => ORES[id] ?? `#${id}`,
    backTo: '/corp/moons/moon-owners',
    payee: { kind: 'corporation', id: 98, name: 'Ashfall Mining Collective' },
    onSetRate: () => {},
    onSettledOtherwise: () => {},
    onPay: () => {},
    onRemove: () => {},
    onAddPayment: () => {},
    onMarkPayout: () => {},
  },
} satisfies Meta<typeof MoonOwnerPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const PaidToAPlayer: Story = {
  args: {
    detail: { ...detail, payee: { kind: 'character', id: 77 } },
    payee: { kind: 'character', id: 77, name: 'Kestrel Vane' },
  },
};

export const PayeeChangedByMoonOwner: Story = {
  args: {
    detail: { ...detail, payee: { kind: 'character', id: 77 } },
    payee: { kind: 'character', id: 77, name: 'Kestrel Vane' },
    onChangePayee: () => {},
    payeeNotice: (
      <PayeeChangeStrip
        storageKey="story"
        at={Date.UTC(2026, 9, 21, 15)}
        payeeName="Kestrel Vane"
        byName="Ashfall Mining Collective"
      />
    ),
  },
};

export const CantReadLedger: Story = {
  args: {
    detail: {
      ...detail,
      row: { ...detail.row, status: 'cant-read', staleSince: Date.UTC(2026, 9, 11, 9, 12) },
    },
  },
};

export const SettledOtherwise: Story = {
  args: {
    detail: {
      ...detail,
      note: 'Fuel for their refineries and free rock access',
      row: { ...detail.row, status: 'settled-otherwise', mode: 'settled-otherwise', owed: 0 },
    },
  },
};

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

export const RefineryLabels: Story = {
  args: {
    refineryName: (id: number) =>
      id === 10 ? 'Efa - Ashfall Tatara' : `Ashfall Mining Collective ${id}`,
  },
};

export const LearnedSystem: Story = {
  args: {
    refineryName: (id: number) => (id === 10 ? 'Efa - Ashfall Tatara' : 'Ikao'),
  },
};

export const ReadOnly: Story = {
  args: {
    refineryEdit: undefined,
    onSetRate: undefined,
    onSettledOtherwise: undefined,
    onRemove: undefined,
    onPay: undefined,
    onAddPayment: undefined,
    onMarkPayout: undefined,
  },
};
