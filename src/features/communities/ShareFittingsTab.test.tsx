import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { db } from '@/db';

const store = vi.hoisted(() => ({
  shared: new Set<string>(),
  shareFitting: vi.fn(),
  shareFittings: vi.fn(),
  unshareFitting: vi.fn(),
  unshareAllFittings: vi.fn(),
}));

vi.mock('./shareAllFittings', () => ({
  collectFittingsToShare: async () => [
    { source: 'saved', key: 'a', name: 'Alpha Fit', code: 'ca' },
    { source: 'saved', key: 'b', name: 'Beta Fit', code: 'cb' },
    { source: 'game', key: '9', name: 'Gamma Fit', code: 'cg' },
  ],
}));
vi.mock('./sharedFittings', () => ({
  loadMySharedFittingKeys: async () => new Set(store.shared),
  shareFitting: store.shareFitting,
  shareFittings: store.shareFittings,
  unshareFitting: store.unshareFitting,
  unshareAllFittings: store.unshareAllFittings,
}));

import { loadFittingsAll, saveFittingsAll } from './shareSelection';
import { ShareFittingsTab } from './ShareFittingsTab';

const f = en.communities.fittings;

/** Opens Add Fittings and returns the dialog. */
async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: f.add }));
  return screen.findByRole('dialog', { name: f.addTitle });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.settings.clear();
  store.shared = new Set();
  store.shareFitting.mockImplementation(async () => true);
  store.shareFittings.mockImplementation(async (_c: number, _m: string, inputs: unknown[]) => {
    store.shared = new Set(['saved-a', 'saved-b', 'game-9']);
    return inputs.length;
  });
  store.unshareFitting.mockResolvedValue(undefined);
  store.unshareAllFittings.mockResolvedValue(undefined);
});

describe('ShareFittingsTab', () => {
  it('shares nothing until a choice is made', async () => {
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    expect(await screen.findByText(f.noneShared)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: f.shareAll })).not.toBeChecked();
  });

  it('shares all, lists every Fitting, and remembers the switch', async () => {
    const user = userEvent.setup();
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    await user.click(await screen.findByRole('checkbox', { name: f.shareAll }));
    expect(await screen.findByText('Alpha Fit')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: f.stop })).toHaveLength(3);
    expect(await loadFittingsAll(1, 'c1')).toEqual(new Set());
  });

  it('stops sharing one Fitting under share-all and remembers it so a re-save skips it', async () => {
    store.shared = new Set(['saved-a', 'saved-b', 'game-9']);
    await saveFittingsAll(1, 'c1', new Set());
    const user = userEvent.setup();
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    const row = (await screen.findByText('Beta Fit')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: f.stop }));
    await waitFor(() => expect(screen.queryByText('Beta Fit')).not.toBeInTheDocument());
    expect(store.unshareFitting).toHaveBeenCalledWith(
      1,
      'c1',
      expect.objectContaining({ key: 'b' })
    );
    expect(await loadFittingsAll(1, 'c1')).toEqual(new Set(['saved-b']));
  });

  it('adds a Fitting from the Add Fittings dialog when not sharing all', async () => {
    const user = userEvent.setup();
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    const dialog = await openAdd(user);
    // Every unshared Fitting is listed without a search.
    expect(within(dialog).getByText('Alpha Fit')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('searchbox'), 'gamma');
    const row = within(dialog).getByText('Gamma Fit').closest('li')!;
    expect(within(row).getByText(f.inGame)).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: f.share }));
    expect(store.shareFitting).toHaveBeenCalledWith(1, 'c1', expect.objectContaining({ key: '9' }));
    await waitFor(() => expect(within(dialog).queryByText('Gamma Fit')).not.toBeInTheDocument());
    expect(await loadFittingsAll(1, 'c1')).toBeNull();
  });

  it('shares a Fitting stopped under share-all again, so its later saves follow', async () => {
    store.shared = new Set(['saved-a', 'game-9']);
    await saveFittingsAll(1, 'c1', new Set(['saved-b']));
    const user = userEvent.setup();
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    const dialog = await openAdd(user);
    const row = within(dialog).getByText('Beta Fit').closest('li')!;
    await user.click(within(row).getByRole('button', { name: f.share }));
    await waitFor(async () => expect(await loadFittingsAll(1, 'c1')).toEqual(new Set()));
    expect(store.shareFitting).toHaveBeenCalledWith(1, 'c1', expect.objectContaining({ key: 'b' }));
  });

  it('keeps a stopped Fitting excluded when sharing it again does not go through', async () => {
    store.shared = new Set(['saved-a', 'game-9']);
    await saveFittingsAll(1, 'c1', new Set(['saved-b']));
    store.shareFitting.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    const dialog = await openAdd(user);
    const row = within(dialog).getByText('Beta Fit').closest('li')!;
    await user.click(within(row).getByRole('button', { name: f.share }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(f.failed);
    expect(await loadFittingsAll(1, 'c1')).toEqual(new Set(['saved-b']));
    // The truth is re-read: Beta is still offered, not listed as shared.
    expect(within(dialog).getByText('Beta Fit')).toBeInTheDocument();
  });

  it('says so in the dialog when a Fitting cannot be shared', async () => {
    store.shareFitting.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    const dialog = await openAdd(user);
    const row = within(dialog).getByText('Alpha Fit').closest('li')!;
    await user.click(within(row).getByRole('button', { name: f.share }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(f.cannot);
  });

  it('filters only what is shared', async () => {
    store.shared = new Set(['saved-a']);
    const user = userEvent.setup();
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    await user.type(await screen.findByRole('searchbox', { name: f.filter }), 'beta');
    expect(await screen.findByText(f.noMatch)).toBeInTheDocument();
    expect(screen.queryByText('Beta Fit')).not.toBeInTheDocument();
  });

  it('turns share-all off with an Undo toast, then removes every shared Fitting', async () => {
    store.shared = new Set(['saved-a']);
    await saveFittingsAll(1, 'c1', new Set());
    const user = userEvent.setup();
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    await user.click(await screen.findByRole('checkbox', { name: f.shareAll }));
    expect((await screen.findAllByText(f.stoppedAll)).length).toBeGreaterThan(0);
    expect(store.unshareAllFittings).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(store.unshareAllFittings).toHaveBeenCalledWith(1, 'c1'));
    await waitFor(async () => expect(await loadFittingsAll(1, 'c1')).toBeNull());
  });

  it('Undo on the share-all toast writes nothing and keeps everything shared', async () => {
    store.shared = new Set(['saved-a']);
    await saveFittingsAll(1, 'c1', new Set());
    const user = userEvent.setup();
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    await user.click(await screen.findByRole('checkbox', { name: f.shareAll }));
    await user.click(await screen.findByRole('button', { name: f.undo }));
    expect(screen.getByRole('checkbox', { name: f.shareAll })).toBeChecked();
    expect(store.unshareAllFittings).not.toHaveBeenCalled();
    expect(await loadFittingsAll(1, 'c1')).not.toBeNull();
  });

  it('lists a shared Fitting this device no longer has, so it can still be stopped', async () => {
    store.shared = new Set(['game-404']);
    const user = userEvent.setup();
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    const row = (await screen.findByText(f.unavailable)).closest('li')!;
    await user.click(within(row).getByRole('button', { name: f.stop }));
    expect(store.unshareFitting).toHaveBeenCalledWith(
      1,
      'c1',
      expect.objectContaining({ source: 'game', key: '404' })
    );
  });

  it('switches share-all back off when switching it on fails part-way', async () => {
    store.shareFittings.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    await user.click(await screen.findByRole('checkbox', { name: f.shareAll }));
    expect(await screen.findByRole('alert')).toHaveTextContent(f.failed);
    expect(await loadFittingsAll(1, 'c1')).toBeNull();
    expect(screen.getByRole('checkbox', { name: f.shareAll })).not.toBeChecked();
  });

  it('reloads the truth when an update fails', async () => {
    store.shared = new Set(['saved-a']);
    store.unshareFitting.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<ShareFittingsTab characterId={1} communityId="c1" />);
    const row = (await screen.findByText('Alpha Fit')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: f.stop }));
    expect(await screen.findByRole('alert')).toHaveTextContent(f.failed);
    expect(await screen.findByText('Alpha Fit')).toBeInTheDocument();
  });
});
