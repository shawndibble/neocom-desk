import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import {
  clearAbyssalEstimateMemory,
  configureMutamarket,
  type MutamarketEstimateResponse,
  type MutamarketRequest,
} from '@/market/mutamarket';
import { AbyssalEstimateLine } from './AbyssalEstimateLine';

const TYPE_ID = 47408;
const ITEM_ID = 1040000000001;
const CHARACTER_ID = 91;

let transport: ReturnType<
  typeof vi.fn<(request: MutamarketRequest) => Promise<MutamarketEstimateResponse>>
>;

beforeEach(async () => {
  clearAbyssalEstimateMemory();
  await db.esiCache.clear();
  transport = vi.fn();
  configureMutamarket({ transport });
});
afterEach(() => configureMutamarket(null));

function renderLine() {
  return render(
    <AbyssalEstimateLine typeId={TYPE_ID} itemId={ITEM_ID} characterId={CHARACTER_ID} />
  );
}

describe('AbyssalEstimateLine', () => {
  it('shows a priced estimate with the MutaMarket credit link', async () => {
    transport.mockResolvedValue({
      status: 'priced',
      value: 1_250_000_000,
      valueUpdatedAt: null,
      url: 'https://mutamarket.com/modules/abc',
    });
    renderLine();
    const credit = await screen.findByRole('link', { name: /Price from MutaMarket/ });
    expect(credit).toHaveAttribute('href', 'https://mutamarket.com/modules/abc');
    expect(screen.getByText('MutaMarket estimate:')).toBeInTheDocument();
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: ITEM_ID, importIfMissing: false })
    );
  });

  it("only imports on the pilot's click, warning that it publishes the module", async () => {
    transport.mockResolvedValueOnce({ status: 'not-imported' });
    renderLine();
    const ask = await screen.findByRole('button', { name: 'Ask MutaMarket to price this' });
    expect(screen.getByText(/publishes the module on MutaMarket/)).toBeInTheDocument();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0].importIfMissing).toBe(false);

    transport.mockResolvedValueOnce({
      status: 'priced',
      value: 300_000_000,
      valueUpdatedAt: null,
      url: 'https://mutamarket.com/modules/xyz',
    });
    await userEvent.setup().click(ask);
    expect(await screen.findByRole('link', { name: /Price from MutaMarket/ })).toBeInTheDocument();
    expect(transport.mock.calls[1]![0].importIfMissing).toBe(true);
  });

  it('says so in words when MutaMarket is unreachable, never 0', async () => {
    transport.mockRejectedValue(new Error('down'));
    renderLine();
    expect(await screen.findByText(/Couldn't reach MutaMarket/)).toBeInTheDocument();
    expect(screen.queryByText(/0 ISK/)).not.toBeInTheDocument();
  });

  it('says MutaMarket has no estimate', async () => {
    transport.mockResolvedValue({ status: 'no-estimate', url: null });
    renderLine();
    expect(
      await screen.findByText('MutaMarket has no estimate for this module.')
    ).toBeInTheDocument();
  });
});
