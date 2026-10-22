import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { DEFAULT_TIME_FORMAT, useTimeFormat } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';
import { CostLedger } from './OrderCostLedger';
import type { OpenOrderRow } from './openOrdersModel';

const OLDEST = '2026-03-10T23:30:00Z';
const NEWEST = '2026-03-12T23:30:00Z';

describe('CostLedger wallet buy range', () => {
  const zone = process.env.TZ;
  afterEach(() => {
    process.env.TZ = zone;
    useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: true });
  });

  it.each(['local', 'eve'] as const)('shows the %s days', (format) => {
    process.env.TZ = 'Pacific/Auckland';
    useTimeFormat.setState({ value: format, hydrated: true });
    const zoneArg = format === 'eve' ? 'UTC' : undefined;
    render(
      <CostLedger
        row={{ price: 100 } as OpenOrderRow}
        costBasis={{
          source: 'wallet',
          unitCost: 90,
          unitsCovered: 10,
          buyCount: 2,
          oldestBuy: OLDEST,
          newestBuy: NEWEST,
          buys: [],
          truncated: false,
        }}
        relistFees={null as never}
        floorShown={null}
      />
    );
    const from = formatDateOnly(new Date(OLDEST), zoneArg);
    const to = formatDateOnly(new Date(NEWEST), zoneArg);
    expect(screen.getByText(`${from} to ${to}`)).toBeInTheDocument();
    expect(formatDateOnly(new Date(OLDEST), 'UTC')).not.toBe(formatDateOnly(new Date(OLDEST)));
  });
});
