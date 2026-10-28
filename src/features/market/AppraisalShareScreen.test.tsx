import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { DEFAULT_TIME_FORMAT, useTimeFormat } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';
import { AppraisalShareScreen } from './AppraisalShareScreen';
import type { AppraisalShareView } from './appraisalShareData';

const GENERATED_AT = Date.UTC(2026, 9, 14, 22, 15) / 1000;
const EXPIRES_AT = Date.UTC(2026, 9, 15, 23, 30);

const view = {
  hub: { systemName: 'Jita' },
  pricePercent: 100,
  generatedAt: GENERATED_AT,
  appraisal: {
    rows: [],
    items: [],
    totals: {
      buy: 0,
      sell: 0,
      spread: 0,
      unpricedRows: 0,
      refine: 0,
      refineUnpricedRows: 0,
      volume: 0,
    },
  },
} as unknown as AppraisalShareView;

const originalTz = process.env.TZ;

afterEach(() => {
  cleanup();
  process.env.TZ = originalTz;
  useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: true });
});

describe('AppraisalShareScreen — Time format', () => {
  it('shows generated and expiry times on EVE time when the preference says so', () => {
    process.env.TZ = 'Pacific/Auckland';
    useTimeFormat.setState({ value: 'eve', hydrated: true });
    render(
      <MemoryRouter>
        <AppraisalShareScreen state={{ status: 'ready', view }} expiresAt={EXPIRES_AT} />
      </MemoryRouter>
    );
    expect(screen.getByText(formatTimestamp(new Date(EXPIRES_AT), 'UTC'))).toBeInTheDocument();
    expect(
      screen.getByText(formatTimestamp(new Date(GENERATED_AT * 1000), 'UTC'))
    ).toBeInTheDocument();
    expect(screen.queryByText(formatTimestamp(new Date(EXPIRES_AT)))).not.toBeInTheDocument();
  });
});

describe('AppraisalShareScreen — split each', () => {
  it('shows the midpoint of buy and sell per line, a dash when a side is unpriced', () => {
    const row = (name: string, buyEach: number | null, sellEach: number | null) => ({
      typeId: name.length,
      name,
      quantity: 1,
      buyEach,
      sellEach,
      buyTotal: buyEach,
      sellTotal: sellEach,
      volume: null,
    });
    const priced = {
      ...view,
      appraisal: {
        ...view.appraisal,
        rows: [row('Tritanium', 100, 200), row('Pyerite', null, 50)],
      },
    } as unknown as AppraisalShareView;
    render(
      <MemoryRouter>
        <AppraisalShareScreen state={{ status: 'ready', view: priced }} expiresAt={EXPIRES_AT} />
      </MemoryRouter>
    );
    expect(screen.getByRole('columnheader', { name: /Split each/ })).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });
});
