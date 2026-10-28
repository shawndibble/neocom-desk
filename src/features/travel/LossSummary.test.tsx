import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { LossSummary } from './LossSummary';
import { useMarketHub } from '@/features/market/hub';
import type { KillmailDetail } from '@/lib/zkillboard';

const prices = vi.hoisted(() => vi.fn());

vi.mock('@/market/prices', () => ({ getHubPrices: prices }));
vi.mock('@/features/abyssal/mutaplasmidData', () => ({ useMutaplasmidLookup: () => null }));
vi.mock('@/features/character/wallet', () => ({ loadWalletJournal: vi.fn(async () => null) }));

const detail = {
  time: '2026-10-01T10:30:00Z',
  victim: { ship_type_id: 587, items: [] },
  victimParty: null,
} as unknown as KillmailDetail;

beforeEach(() => {
  prices.mockReset();
  prices.mockResolvedValue(new Map([[587, { sellMin: 1_000_000 }]]));
});

describe('LossSummary', () => {
  it('prices at Jita whatever the Settings hub is, and does not refetch when it changes', async () => {
    useMarketHub.setState({ value: 'amarr' });
    render(<LossSummary detail={detail} zkbValue={null} />);
    expect(await screen.findByText('What it cost, Jita sell')).toBeTruthy();
    expect(prices).toHaveBeenCalledTimes(1);
    expect(prices.mock.calls[0][0].id).toBe('jita');

    useMarketHub.setState({ value: 'hek' });
    await screen.findByText('What it cost, Jita sell');
    expect(prices).toHaveBeenCalledTimes(1);
  });
});
