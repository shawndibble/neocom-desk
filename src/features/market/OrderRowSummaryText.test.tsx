import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
import { OrderRowSummaryText } from './OrderRowSummaryText';
import type { OpenOrderRow } from './openOrdersModel';

const BASE_ROW: OpenOrderRow = {
  orderId: 101,
  characterId: 1,
  characterName: 'Alpha',
  typeId: 34,
  typeName: 'Tritanium',
  isBuyOrder: false,
  price: 500_000,
  volumeRemain: 10,
  volumeTotal: 10,
  locationId: 60003760,
  regionId: 10000002,
  stationName: 'Jita IV - Moon 4',
  issued: new Date().toISOString(),
  durationDays: 90,
  expiry: { expiresAt: Date.now() + 60 * 86_400_000, daysLeft: 60, expired: false },
  floor: null,
  costBasis: null,
  station: { bestPrice: 440_000, beatsMe: true, gapIsk: 60_000, gapPct: 12 },
  deepUndercut: null,
  worstScope: 'station',
  problem: 'undercutStation',
  problems: ['undercutStation'],
  iskTiedUp: 5_000_000,
  belowFloor: false,
  frequentlyUndercut: false,
};

describe('OrderRowSummaryText relist price', () => {
  afterEach(() => configureClipboard(null));

  it('shows the relist price with a copy button that copies the legal price', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    render(<OrderRowSummaryText row={BASE_ROW} copyRelistPrice />);
    expect(screen.getByText(/→ 439,900\.00/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /Copy 439,900/ }));
    expect(written).toEqual(['439900']);
  });

  it('shows no copy control unless asked (phone list)', () => {
    render(<OrderRowSummaryText row={BASE_ROW} interactive={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows no copy control on a healthy row', () => {
    const row: OpenOrderRow = { ...BASE_ROW, problem: 'healthy', problems: ['healthy'] };
    render(<OrderRowSummaryText row={row} copyRelistPrice />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
