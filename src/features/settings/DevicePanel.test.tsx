import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { DevicePanel } from './DevicePanel';

vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));
const deleteMock = vi.hoisted(() => ({
  purgeAllRemoteCharacterData: vi.fn<() => Promise<number[]>>(async () => []),
  deleteAllLocalData: vi.fn(async () => {}),
}));
vi.mock('@/features/character/deleteAllCharacterData', () => deleteMock);

const replace = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { ...window.location, replace });
  deleteMock.purgeAllRemoteCharacterData.mockImplementation(async () => []);
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
  await user.click(await screen.findByRole('button', { name: 'Delete all…' }));
  const dialog = await screen.findByRole('dialog');
  return { user, dialog };
}

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
});
