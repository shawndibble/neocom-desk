import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoonOwnersTable } from './MoonOwnersTable';
import { NAMES, NOW, ROWS, TOTALS } from './moonOwnerRowFixtures';

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

export const Default: Story = {};

export const Single: Story = {
  args: {
    rows: ROWS.slice(0, 1),
    totals: { owed: 13_024_480, paidThisMonth: 0, count: 1, needALook: 0 },
  },
};

export const ReadOnly: Story = { args: { onPay: undefined } };

export const WithYours: Story = {
  args: {
    rows: [
      ...ROWS.slice(0, 2),
      {
        ...ROWS[0]!,
        id: 'y1',
        corporationId: 9001,
        mode: 'settled-otherwise',
        sameOwner: true,
        owed: 0,
      },
      {
        ...ROWS[0]!,
        id: 'y2',
        corporationId: 9002,
        mode: 'settled-otherwise',
        sameOwner: true,
        owed: 0,
        refineryCount: 2,
      },
    ],
    name: (id: number) =>
      ({ 9001: 'Ironvale Reach', 9002: 'Ashen Harbor Mining' })[id] ?? NAMES[id] ?? `#${id}`,
  },
};

export const Phone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  args: {
    rows: [
      {
        ...ROWS[0]!,
        id: 'long',
        corporationId: 9100,
        owed: 48_123_456_789,
      },
      ...ROWS.slice(0, 2),
    ],
    name: (id: number) =>
      id === 9100
        ? 'Brinewater Deep Space Extraction and Hauling Collective'
        : (NAMES[id] ?? `#${id}`),
  },
};
