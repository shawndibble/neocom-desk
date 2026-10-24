import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ImportPanel } from './ImportPanel';

const mocks = vi.hoisted(() => ({
  importBackup: vi.fn(),
  requestPersistence: vi.fn(async () => 'granted' as const),
}));
vi.mock('@/backup/io', () => ({ importBackup: mocks.importBackup }));
vi.mock('@/lib/persistStorage', () => ({ requestPersistence: mocks.requestPersistence }));

const EMPTY = {
  addedCharacterIds: [],
  skippedCharacterIds: [],
  addedSettingKeys: [],
  skippedSettingKeys: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  // The panel reloads 2s after an import that adds something; jsdom cannot.
  const realSetTimeout = window.setTimeout;
  vi.spyOn(window, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) =>
    ms === 2000 ? 0 : realSetTimeout(fn, ms)) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function importFile() {
  const user = userEvent.setup();
  render(<ImportPanel />);
  await user.upload(
    screen.getByLabelText('Backup file'),
    new File(['{}'], 'backup.json', { type: 'application/json' })
  );
  await user.type(screen.getByLabelText('Password'), 'pw');
  await user.click(screen.getByRole('button', { name: 'Import backup' }));
}

describe('ImportPanel persistent storage', () => {
  it('asks the browser to keep the data once an import adds a Character', async () => {
    mocks.importBackup.mockResolvedValue({ ...EMPTY, addedCharacterIds: [7] });
    await importFile();
    await waitFor(() => expect(mocks.requestPersistence).toHaveBeenCalledOnce());
  });

  it('does not ask when the import adds no Character', async () => {
    mocks.importBackup.mockResolvedValue({ ...EMPTY, skippedCharacterIds: [7] });
    await importFile();
    await waitFor(() => expect(mocks.importBackup).toHaveBeenCalledOnce());
    expect(mocks.requestPersistence).not.toHaveBeenCalled();
  });
});
