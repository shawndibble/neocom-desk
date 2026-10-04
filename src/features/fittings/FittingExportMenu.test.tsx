import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { configureClipboard } from '@/lib/clipboard';
import { decodeFittingShare } from '@/engine/fitting/fittingShare';
import type { Fitting } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import { createShareLink, existingShareLink } from '@/features/share/shareStore';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { FittingExportMenu } from './FittingExportMenu';
import { exportFitting } from './fittingExportText';

vi.mock('@/features/share/shareStore', () => ({
  existingShareLink: vi.fn(() => null),
  createShareLink: vi.fn(async () => 'https://neocomdesk.com/share/abc123XYZ'),
}));
vi.mock('@/app/syncStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/syncStatus')>()),
  isSyncConfigured: () => true,
}));

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
  const state = location.state as { appraiseText?: string; fitImportText?: string } | null;
  return (
    <p data-testid="at" data-text={state?.appraiseText} data-fit-import-text={state?.fitImportText}>
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
    <MemoryRouter initialEntries={['/ships/fittings']}>
      <Routes>
        <Route
          path="/ships/fittings"
          element={<FittingExportMenu fitting={FITTING} price={price} />}
        />
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

afterEach(() => {
  configureClipboard(null);
  vi.mocked(createShareLink).mockClear();
  useActiveCharacter.setState({ activeCharacterId: null });
});

describe('FittingExportMenu', () => {
  it('leaves the permanent link to the address bar, and offers no in-game link', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByRole('menuitem', { name: 'Copy Fitting' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Copy permanent link' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Copy in-game link' })).toBeNull();
  });

  // The Fittings library's row menu still copies one.
  it('builds a permanent link that decodes back to the Fitting', async () => {
    const url = new URL((await exportFitting('permanentLink', FITTING)) ?? '');
    expect(url.pathname.endsWith('/ships/fittings')).toBe(true);
    const decoded = await decodeFittingShare(url.searchParams.get('f') ?? '');
    expect(decoded.ok && decoded.value.hullTypeId).toBe(587);
  });

  it('keeps the whole implant set in the link, leaving the clone’s implants off the multibuy list', async () => {
    // A set seeded from a clone holding 8 and 9, with implant 11 and booster 10 added.
    const seeded: Fitting = { ...FITTING, implantSet: { implants: [8, 9, 11], boosters: [10] } };
    const clone = [8, 9];

    const url = new URL((await exportFitting('permanentLink', seeded, clone)) ?? '');
    const decoded = await decodeFittingShare(url.searchParams.get('f') ?? '');
    expect(decoded.ok && decoded.value.implantSet).toEqual({
      implants: [8, 9, 11],
      boosters: [10],
    });

    const lines = ((await exportFitting('multibuy', seeded, clone)) ?? '').split('\n');
    expect(lines).toEqual(['Rifter\t1', '200mm AutoCannon II\t1', 'Type 11\t1', 'Type 10\t1']);
  });

  it('copies a short Share Link storing the Fitting Share Code', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7 });
    const copied = setup();
    await choose('Copy Share Link');
    await waitFor(() => expect(copied).toEqual(['https://neocomdesk.com/share/abc123XYZ']));
    const call = vi.mocked(createShareLink).mock.calls[0][0];
    expect(call).toMatchObject({ type: 'fitting', characterId: 7 });
    expect(call.payload).toEqual({ v: 1, code: call.reuseKey });
    const decoded = await decodeFittingShare(call.reuseKey);
    expect(decoded.ok && decoded.value.hullTypeId).toBe(587);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Share Link copied — it works for 7 days'
    );
  });

  it('copies a link already made for this fit without storing another', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7 });
    vi.mocked(existingShareLink).mockReturnValue('https://neocomdesk.com/share/made1Earl');
    const copied = setup();
    await choose('Copy Share Link');
    await waitFor(() => expect(copied).toEqual(['https://neocomdesk.com/share/made1Earl']));
    expect(createShareLink).not.toHaveBeenCalled();
    vi.mocked(existingShareLink).mockReturnValue(null);
  });

  it('says so when the Share Link could not be stored, copying nothing', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7 });
    vi.mocked(createShareLink).mockRejectedValueOnce(new Error('permission-denied'));
    const copied = setup();
    await choose('Copy Share Link');
    expect(await screen.findByRole('status')).toHaveTextContent(
      "Couldn't create the Share Link. Try again."
    );
    expect(copied).toEqual([]);
  });

  it('copies the Fitting as EFT text and the multibuy list', async () => {
    const copied = setup();
    await choose('Copy Fitting');
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toBe('[Rifter, Brawler]\n200mm AutoCannon II');

    await choose('Copy multibuy list');
    await waitFor(() => expect(copied).toHaveLength(2));
    expect(copied[1]).toBe('Rifter\t1\n200mm AutoCannon II\t1');
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

  it('hands its EFT text to Industry’s Fit Import, pre-filled', async () => {
    setup();
    await choose('Manufacture Plan');
    const at = await screen.findByTestId('at');
    expect(at).toHaveTextContent('/industry');
    expect(at).toHaveAttribute('data-fit-import-text', '[Rifter, Brawler]\n200mm AutoCannon II');
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
