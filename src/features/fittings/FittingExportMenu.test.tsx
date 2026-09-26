import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { configureClipboard } from '@/lib/clipboard';
import { decodeFittingShare } from '@/engine/fitting/fittingShare';
import type { Fitting } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import { FittingExportMenu } from './FittingExportMenu';

const download = vi.hoisted(() => vi.fn());
vi.mock('@/lib/download', () => ({ downloadTextFile: download }));

vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({
    '587': { name: 'Rifter' },
    '1': { name: '200mm AutoCannon II' },
  }),
}));

const FITTING: Fitting = {
  name: 'Brawler',
  shipTypeId: 587,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 1, state: 'active' }],
  drones: [],
  cargo: [],
};

const PRICE = { totals: { buy: 1000, sell: 2000, unpricedRows: 0 } } as Appraisal;

function LocationState() {
  const location = useLocation();
  return (
    <p
      data-testid="at"
      data-text={(location.state as { appraiseText?: string } | null)?.appraiseText}
    >
      {location.pathname}
    </p>
  );
}

function setup(price: Appraisal | null = PRICE) {
  const copied: string[] = [];
  configureClipboard(async (text) => {
    copied.push(text);
  });
  render(
    <MemoryRouter initialEntries={['/fittings']}>
      <Routes>
        <Route path="/fittings" element={<FittingExportMenu fitting={FITTING} price={price} />} />
        <Route path="*" element={<LocationState />} />
      </Routes>
    </MemoryRouter>
  );
  return copied;
}

async function choose(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Export' }));
  await user.click(await screen.findByRole('menuitem', { name }));
}

afterEach(() => configureClipboard(null));

describe('FittingExportMenu', () => {
  it('copies a Share Link that decodes back to the Fitting', async () => {
    const copied = setup();
    await choose('Copy Share Link');
    await waitFor(() => expect(copied).toHaveLength(1));
    const url = new URL(copied[0]);
    expect(url.pathname.endsWith('/fittings')).toBe(true);
    const decoded = await decodeFittingShare(url.searchParams.get('f') ?? '');
    expect(decoded.ok && decoded.value.hullTypeId).toBe(587);
    expect(await screen.findByRole('status')).toHaveTextContent('Share Link copied');
  });

  it('copies EFT, the in-game link and the multibuy list', async () => {
    const copied = setup();
    await choose('Copy EFT');
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toBe('[Rifter, Brawler]\n200mm AutoCannon II');

    await choose('Copy in-game link');
    await waitFor(() => expect(copied).toHaveLength(2));
    expect(copied[1]).toBe('<url=fitting:587:1;1::>Brawler</url>');

    await choose('Copy multibuy list');
    await waitFor(() => expect(copied).toHaveLength(3));
    expect(copied[2]).toBe('Rifter\t1\n200mm AutoCannon II\t1');
  });

  it('shows the Jita price and hands the multibuy list to Appraisal', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Jita sell: 2,000 ISK')).toBeInTheDocument();
    expect(screen.getByText('Jita buy: 1,000 ISK')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Appraise in Market' }));
    const at = await screen.findByTestId('at');
    expect(at).toHaveTextContent('/market/appraisal');
    expect(at).toHaveAttribute('data-text', 'Rifter\t1\n200mm AutoCannon II\t1');
  });

  it('says pricing is in flight while the price loads', async () => {
    setup(null);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Pricing…')).toBeInTheDocument();
  });
});

describe('FittingExportMenu — EVE XML', () => {
  it('downloads the fit as the game’s fittings XML, named after it', async () => {
    download.mockClear();
    setup();
    await choose('Download EVE XML');
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    const [filename, text, mime] = download.mock.calls[0] as [string, string, string];
    expect(filename).toBe('Brawler.xml');
    expect(text).toContain('<shipType value="Rifter"/>');
    expect(text).toContain('<hardware slot="hi slot 0" type="200mm AutoCannon II"/>');
    expect(mime).toMatch(/xml/);
    expect(await screen.findByRole('status')).toHaveTextContent('Fitting XML downloaded');
  });
});
