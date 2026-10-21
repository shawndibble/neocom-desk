import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoonOwnersTable } from './MoonOwnersTable';
import { NAMES, NOW, ROWS, TOTALS } from './moonOwnerRowFixtures';

/** @summary The Moon owners tab (List A): header chips and one sortable table, a row per moon owner. */
const meta = {
  title: 'corp/MoonOwnersTable',
  component: MoonOwnersTable,
  parameters: { layout: 'padded' },
  args: {
    rows: ROWS,
    totals: TOTALS,
    name: (id: number) => NAMES[id] ?? `#${id}`,
    now: NOW,
    onOpen: () => {},
    onPay: () => {},
  },
} satisfies Meta<typeof MoonOwnersTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary All five statuses, with Pay… on every row that is owed. */
export const Default: Story = {};

/** @summary One moon owner, healthy. */
export const Single: Story = {
  args: {
    rows: ROWS.slice(0, 1),
    totals: { owed: 13_024_480, paidThisMonth: 0, count: 1, needALook: 0 },
  },
};

/** @summary A viewer who may not record payments: no Pay… column. */
export const ReadOnly: Story = { args: { onPay: undefined } };
