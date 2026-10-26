import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { DevicePanel } from './DevicePanel';
import { setStatus } from '@/sync/status';

vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));
const deleteMock = vi.hoisted(() => ({
  purgeAllRemoteCharacterData: vi.fn<() => Promise<number[]>>(async () => []),
  deleteAllLocalData: vi.fn(async () => {}),
  loadAllCommunities: vi.fn<() => Promise<unknown[]>>(async () => []),
  leaveAllCommunities: vi.fn<(communities: unknown[]) => Promise<number[]>>(async () => []),
}));
vi.mock('@/features/character/deleteAllCharacterData', () => deleteMock);

const replace = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { ...window.location, replace });
  deleteMock.purgeAllRemoteCharacterData.mockImplementation(async () => []);
  deleteMock.loadAllCommunities.mockImplementation(async () => []);
  deleteMock.leaveAllCommunities.mockImplementation(async () => []);
  await db.characters.clear();
  await db.characters.bulkPut([
    { characterId: 1, name: 'Alpha', ownerHash: 'h1', addedAt: 1 },
    { characterId: 2, name: 'Bravo', ownerHash: 'h2', addedAt: 1 },
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openDeleteDialog() {
  const user = userEvent.setup();
  render(<DevicePanel />);
  await user.click(await screen.findByRole('button', { name: 'Delete all' }));
  const dialog = await screen.findByRole('dialog');
  return { user, dialog };
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

describe('DevicePanel log out', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'onLine');
    setStatus(1, { state: 'idle', lastSyncedAt: null, error: null });
    setStatus(2, { state: 'idle', lastSyncedAt: null, error: null });
  });

  async function openLogoutDialog() {
    const user = userEvent.setup();
    render(<DevicePanel />);
    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    return within(await screen.findByRole('dialog'));
  }

  it('warns that unsynced edits are lost when offline', async () => {
    setOnline(false);
    const dialog = await openLogoutDialog();
    expect(dialog.getByRole('alert')).toHaveTextContent(/offline.*will be lost/i);
  });

  it('warns when a character has not synced cleanly', async () => {
    setStatus(1, { state: 'idle', lastSyncedAt: 5, error: null });
    setStatus(2, { state: 'error', lastSyncedAt: 5, error: 'boom' });
    const dialog = await openLogoutDialog();
    expect(dialog.getByRole('alert')).toHaveTextContent(/may not have synced/i);
  });

  it('shows no warning when online and every character synced cleanly', async () => {
    setStatus(1, { state: 'idle', lastSyncedAt: 5, error: null });
    setStatus(2, { state: 'idle', lastSyncedAt: 5, error: null });
    const dialog = await openLogoutDialog();
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('puts focus on Cancel, not the destructive button', async () => {
    const dialog = await openLogoutDialog();
    expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
});

describe('DevicePanel delete all character data', () => {
  it('purges remote data, wipes local data, then reloads to a fresh boot', async () => {
    const { user, dialog } = await openDeleteDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Delete all' }));

    expect(deleteMock.purgeAllRemoteCharacterData).toHaveBeenCalledOnce();
    expect(deleteMock.deleteAllLocalData).toHaveBeenCalledWith(true);
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('names the characters whose purge failed, and waits before deleting locally', async () => {
    deleteMock.purgeAllRemoteCharacterData.mockImplementation(async () => [2]);
    const { user, dialog } = await openDeleteDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Delete all' }));

    expect(
      await within(dialog).findByText(/Bravo could not be deleted from the sync server/)
    ).toBeInTheDocument();
    expect(deleteMock.deleteAllLocalData).not.toHaveBeenCalled();
    // The other Characters' remote data is already gone; backing out is not offered.
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Finish deleting' }));

    expect(deleteMock.purgeAllRemoteCharacterData).toHaveBeenCalledOnce();
    expect(deleteMock.deleteAllLocalData).toHaveBeenCalledWith(true);
  });

  describe('Communities', () => {
    const joined = { characterId: 1, communityId: 'a', name: 'Haulers', administered: false };
    const run = { characterId: 2, communityId: 'b', name: 'Miners', administered: true };

    it('shows no checkbox, and leaves nothing, when no Character is in a Community', async () => {
      const { user, dialog } = await openDeleteDialog();
      expect(within(dialog).queryByLabelText('Also leave my Communities')).toBeNull();
      await user.click(within(dialog).getByRole('button', { name: 'Delete all' }));
      expect(deleteMock.leaveAllCommunities).not.toHaveBeenCalled();
    });

    it('offers a checked box, lists a Community it administers, and leaves before the wipe', async () => {
      deleteMock.loadAllCommunities.mockImplementation(async () => [joined, run]);
      const { user, dialog } = await openDeleteDialog();
      expect(await within(dialog).findByLabelText('Also leave my Communities')).toBeChecked();
      expect(within(dialog).getByText(/You run Miners: delete it or hand it over/)).toBeVisible();

      await user.click(within(dialog).getByRole('button', { name: 'Delete all' }));

      expect(deleteMock.leaveAllCommunities).toHaveBeenCalledWith([joined, run]);
      expect(deleteMock.deleteAllLocalData).toHaveBeenCalled();
    });

    it('leaves nothing when the box is unticked', async () => {
      deleteMock.loadAllCommunities.mockImplementation(async () => [joined]);
      const { user, dialog } = await openDeleteDialog();
      await user.click(await within(dialog).findByLabelText('Also leave my Communities'));
      await user.click(within(dialog).getByRole('button', { name: 'Delete all' }));
      expect(deleteMock.leaveAllCommunities).not.toHaveBeenCalled();
      expect(deleteMock.deleteAllLocalData).toHaveBeenCalled();
    });

    it('reports a Character that could not leave, and still waits for Finish deleting', async () => {
      deleteMock.loadAllCommunities.mockImplementation(async () => [joined]);
      deleteMock.leaveAllCommunities.mockImplementation(async () => [1]);
      const { user, dialog } = await openDeleteDialog();
      await within(dialog).findByLabelText('Also leave my Communities');
      await user.click(within(dialog).getByRole('button', { name: 'Delete all' }));
      expect(
        await within(dialog).findByText(/Alpha could not leave its Communities/)
      ).toBeVisible();
      expect(deleteMock.deleteAllLocalData).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Finish deleting' }));
      expect(deleteMock.deleteAllLocalData).toHaveBeenCalled();
      expect(deleteMock.leaveAllCommunities).toHaveBeenCalledTimes(1);
    });
  });
});
